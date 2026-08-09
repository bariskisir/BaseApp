/**
 * Stores validated settings and generic sessions through serialized JSON file access.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  AppSettings,
  AppSettingsPatch,
  DeleteSessionResult,
  SessionDocument,
  SessionSummary,
} from '@shared/types'
import { z } from 'zod'
import { parsePersistedSettings, settingsSchema } from '../settingsSchema'

const sessionSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(200),
  isDefaultTitle: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  data: z.record(z.string(), z.unknown()),
})

const DEFAULT_SESSION_TITLE = 'New Session'

/** Rejects identifiers that could escape the session directory. */
const assertSessionId = (id: string): void => {
  if (!z.uuid().safeParse(id).success) throw new Error('Invalid session identifier.')
}

/** Owns durable settings and generic session workspaces. */
export default class StorageService {
  private readonly settingsPath: string
  private readonly sessionsPath: string
  private readonly fileOperationTails = new Map<string, Promise<void>>()

  /** Creates a storage service rooted in the private application data directory. */
  public constructor(private readonly rootPath: string) {
    this.settingsPath = join(rootPath, 'settings.json')
    this.sessionsPath = join(rootPath, 'sessions')
  }

  /** Creates required directories and removes obsolete interrupted-write files. */
  public async initialize(): Promise<void> {
    await mkdir(this.rootPath, { recursive: true })
    await mkdir(this.sessionsPath, { recursive: true })
    await Promise.all([
      this.removeObsoleteTemporaryFiles(this.rootPath),
      this.removeObsoleteTemporaryFiles(this.sessionsPath),
    ])
  }

  /** Loads validated settings or safe defaults for missing or malformed data. */
  public async loadSettings(): Promise<AppSettings> {
    return this.withFileLock(this.settingsPath, () => this.readSettingsUnlocked())
  }

  /** Reads settings while its caller owns the settings-file operation lock. */
  private async readSettingsUnlocked(): Promise<AppSettings> {
    try {
      const value: unknown = JSON.parse(await readFile(this.settingsPath, 'utf8'))
      return parsePersistedSettings(value)
    } catch {
      return parsePersistedSettings(null)
    }
  }

  /** Validates and atomically replaces the persisted application settings. */
  public async saveSettings(settings: AppSettings): Promise<AppSettings> {
    const validated = settingsSchema.parse(settings)
    await this.writeJsonFile(this.settingsPath, validated)
    return validated
  }

  /** Atomically merges changed fields into the latest validated settings document. */
  public async updateSettings(patch: AppSettingsPatch): Promise<AppSettings> {
    return this.withFileLock(this.settingsPath, async () => {
      const current = await this.readSettingsUnlocked()
      const validated = settingsSchema.parse({ ...current, ...patch })
      await this.writeJsonFileUnlocked(this.settingsPath, validated)
      return validated
    })
  }

  /** Creates a new empty generic session. */
  public async createSession(title?: string): Promise<SessionDocument> {
    const now = new Date().toISOString()
    const normalizedTitle = title?.trim().slice(0, 200)
    const session: SessionDocument = {
      id: randomUUID(),
      title: normalizedTitle || DEFAULT_SESSION_TITLE,
      isDefaultTitle: !normalizedTitle,
      createdAt: now,
      updatedAt: now,
      data: {},
    }
    await this.writeSession(session)
    return session
  }

  /** Loads and validates one complete session. */
  public async getSession(id: string): Promise<SessionDocument> {
    assertSessionId(id)
    const filePath = this.sessionPath(id)
    return this.withFileLock(filePath, () => this.readSessionUnlocked(filePath))
  }

  /** Lists compact session summaries in reverse chronological order. */
  public async listSessions(): Promise<SessionSummary[]> {
    const entries = await readdir(this.sessionsPath, { withFileTypes: true })
    const documents = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => this.tryReadSession(join(this.sessionsPath, entry.name))),
    )

    return documents
      .filter((document): document is SessionDocument => document !== null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(({ id, title, isDefaultTitle, createdAt, updatedAt }) => ({
        id,
        title,
        isDefaultTitle,
        createdAt,
        updatedAt,
      }))
  }

  /** Renames a session within the same serialized file operation used by other writes. */
  public async renameSession(id: string, title: string): Promise<SessionDocument> {
    const normalizedTitle = title.trim().slice(0, 200)
    if (!normalizedTitle) throw new Error('Session title cannot be empty.')
    return this.updateSession(id, (session) => {
      session.title = normalizedTitle
      session.isDefaultTitle = false
      session.updatedAt = new Date().toISOString()
    })
  }

  /** Deletes a session and creates a replacement when it was the final workspace. */
  public async deleteSession(id: string): Promise<DeleteSessionResult> {
    assertSessionId(id)
    return this.withFileLock(this.sessionsPath, () => this.deleteSessionUnlocked(id))
  }

  /** Performs one deletion while holding the workspace-wide session lock. */
  private async deleteSessionUnlocked(id: string): Promise<DeleteSessionResult> {
    const sessions = await this.listSessions()
    const target = sessions.find((session) => session.id === id)
    if (!target) return { deleted: false }

    const replacement = sessions.length === 1 ? await this.createSession() : undefined
    const filePath = this.sessionPath(id)
    try {
      await this.withFileLock(filePath, () => unlink(filePath))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        if (replacement) await unlink(this.sessionPath(replacement.id)).catch(() => undefined)
        throw error
      }
    }
    return replacement ? { deleted: true, replacement } : { deleted: true }
  }

  /** Deletes every session and returns a fresh empty workspace as the replacement. */
  public async deleteAllSessions(): Promise<SessionDocument> {
    return this.withFileLock(this.sessionsPath, async () => {
      const sessions = await this.listSessions()
      const replacement = await this.createSession()
      for (const session of sessions) {
        const filePath = this.sessionPath(session.id)
        try {
          await this.withFileLock(filePath, () => unlink(filePath))
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
      return replacement
    })
  }

  /** Reads one session while tolerating malformed history entries. */
  private async tryReadSession(filePath: string): Promise<SessionDocument | null> {
    try {
      return await this.withFileLock(filePath, () => this.readSessionUnlocked(filePath))
    } catch {
      return null
    }
  }

  /** Applies one session mutation without allowing another operation to interleave. */
  private async updateSession(
    id: string,
    update: (session: SessionDocument) => void,
  ): Promise<SessionDocument> {
    assertSessionId(id)
    const filePath = this.sessionPath(id)
    return this.withFileLock(filePath, async () => {
      const session = await this.readSessionUnlocked(filePath)
      update(session)
      const validated = sessionSchema.parse(session)
      await this.writeJsonFileUnlocked(filePath, validated)
      return validated
    })
  }

  /** Validates and writes a complete session document. */
  private async writeSession(session: SessionDocument): Promise<void> {
    const validated = sessionSchema.parse(session)
    await this.writeJsonFile(this.sessionPath(validated.id), validated)
  }

  /** Reads a session while its caller owns the file-operation lock. */
  private async readSessionUnlocked(filePath: string): Promise<SessionDocument> {
    const value: unknown = JSON.parse(await readFile(filePath, 'utf8'))
    return sessionSchema.parse(value)
  }

  /** Resolves a validated session identifier to its JSON file. */
  private sessionPath(id: string): string {
    return join(this.sessionsPath, `${id}.json`)
  }

  /** Serializes and atomically writes one JSON value under its file-operation lock. */
  private async writeJsonFile(filePath: string, value: unknown): Promise<void> {
    await this.withFileLock(filePath, () => this.writeJsonFileUnlocked(filePath, value))
  }

  /** Commits one complete JSON payload without exposing a partially written destination. */
  private async writeJsonFileUnlocked(filePath: string, value: unknown): Promise<void> {
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`
    try {
      await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
      await rename(temporaryPath, filePath)
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }

  /** Runs one operation after every earlier operation targeting the same file. */
  private async withFileLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.fileOperationTails.get(filePath) ?? Promise.resolve()
    /** Releases this operation's gate even when the protected operation fails. */
    let release = (): void => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.catch(() => undefined).then(() => gate)
    this.fileOperationTails.set(filePath, tail)
    await previous.catch(() => undefined)
    try {
      return await operation()
    } finally {
      release()
      if (this.fileOperationTails.get(filePath) === tail) this.fileOperationTails.delete(filePath)
    }
  }

  /** Removes only obsolete interrupted-write files created by earlier builds. */
  private async removeObsoleteTemporaryFiles(directoryPath: string): Promise<void> {
    const entries = await readdir(directoryPath, { withFileTypes: true })
    await Promise.allSettled(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.tmp'))
        .map((entry) => unlink(join(directoryPath, entry.name))),
    )
  }
}
