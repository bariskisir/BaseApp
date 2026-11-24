import { randomUUID } from 'node:crypto'
import { mkdir, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import {
  readJsonFile,
  removeInterruptedWrites,
  writeJsonFileAtomic,
} from '@app/base/node/atomicFile'
import { FileOperationQueue } from '@app/base/node/fileOperationQueue'
import { z } from 'zod'
import {
  compareSessionSummaries,
  type DeleteSessionResult,
  MAX_SESSION_TITLE_LENGTH,
  type SessionDocument,
  type SessionSummary,
  sessionIdSchema,
  toSessionSummary,
} from '../common/sessions'

const sessionSchema = z.object({
  id: sessionIdSchema,
  title: z.string().min(1).max(MAX_SESSION_TITLE_LENGTH),
  isDefaultTitle: z.boolean(),
  pinned: z.boolean().default(false),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  data: z.record(z.string(), z.unknown()),
})

const DEFAULT_SESSION_TITLE = 'New Session'

function assertSessionId(id: string): void {
  if (!sessionIdSchema.safeParse(id).success) {
    throw new Error('Invalid session identifier.')
  }
}

function normalizeTitle(title: string | undefined): string {
  return title?.trim().slice(0, MAX_SESSION_TITLE_LENGTH) ?? ''
}

export class SessionRepository {
  constructor(
    private readonly directoryPath: string,
    private readonly queue: FileOperationQueue = new FileOperationQueue(),
  ) {}

  async initialize(): Promise<void> {
    await mkdir(this.directoryPath, { recursive: true })
    await removeInterruptedWrites(this.directoryPath)
  }

  async create(title?: string): Promise<SessionDocument> {
    return this.queue.run(this.directoryPath, () => this.createUnlocked(title))
  }

  async get(id: string): Promise<SessionDocument> {
    assertSessionId(id)
    const filePath = this.sessionPath(id)
    return this.queue.run(filePath, () => this.readUnlocked(filePath))
  }

  async list(): Promise<SessionSummary[]> {
    const entries = await readdir(this.directoryPath, { withFileTypes: true })
    const documents = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => this.tryRead(join(this.directoryPath, entry.name))),
    )

    return documents
      .filter((document): document is SessionDocument => document !== null)
      .map(toSessionSummary)
      .sort(compareSessionSummaries)
  }

  async rename(id: string, title: string): Promise<SessionDocument> {
    const normalizedTitle = normalizeTitle(title)
    if (!normalizedTitle) {
      throw new Error('Session title cannot be empty.')
    }
    return this.update(id, (session) => ({
      ...session,
      title: normalizedTitle,
      isDefaultTitle: false,
      updatedAt: new Date().toISOString(),
    }))
  }

  async setPinned(id: string, pinned: boolean): Promise<SessionDocument> {
    return this.update(id, (session) => ({
      ...session,
      pinned,
    }))
  }

  async delete(id: string): Promise<DeleteSessionResult> {
    assertSessionId(id)
    return this.queue.run(this.directoryPath, async () => {
      const sessions = await this.list()
      if (!sessions.some((session) => session.id === id)) {
        return { deleted: false }
      }

      const replacement = sessions.length === 1 ? await this.createUnlocked() : undefined
      try {
        await this.removeFile(id)
      } catch (error) {
        if (replacement) {
          await this.removeFile(replacement.id).catch(() => undefined)
        }
        throw error
      }
      return replacement ? { deleted: true, replacement } : { deleted: true }
    })
  }

  async deleteAll(): Promise<SessionDocument> {
    return this.queue.run(this.directoryPath, async () => {
      const sessions = await this.list()
      const replacement = await this.createUnlocked()
      for (const session of sessions) {
        await this.removeFile(session.id)
      }
      return replacement
    })
  }

  private async createUnlocked(title?: string): Promise<SessionDocument> {
    const now = new Date().toISOString()
    const normalizedTitle = normalizeTitle(title)
    const session = sessionSchema.parse({
      id: randomUUID(),
      title: normalizedTitle || DEFAULT_SESSION_TITLE,
      isDefaultTitle: !normalizedTitle,
      pinned: false,
      createdAt: now,
      updatedAt: now,
      data: {},
    })
    const filePath = this.sessionPath(session.id)
    await this.queue.run(filePath, () => writeJsonFileAtomic(filePath, session))
    return session
  }

  private async update(
    id: string,
    change: (session: SessionDocument) => SessionDocument,
  ): Promise<SessionDocument> {
    assertSessionId(id)
    const filePath = this.sessionPath(id)
    return this.queue.run(filePath, async () => {
      const session = sessionSchema.parse(change(await this.readUnlocked(filePath)))
      await writeJsonFileAtomic(filePath, session)
      return session
    })
  }

  private async tryRead(filePath: string): Promise<SessionDocument | null> {
    try {
      return await this.queue.run(filePath, () => this.readUnlocked(filePath))
    } catch {
      return null
    }
  }

  private async readUnlocked(filePath: string): Promise<SessionDocument> {
    return sessionSchema.parse(await readJsonFile(filePath))
  }

  private async removeFile(id: string): Promise<void> {
    const filePath = this.sessionPath(id)
    try {
      await this.queue.run(filePath, () => unlink(filePath))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }

  private sessionPath(id: string): string {
    return join(this.directoryPath, `${id}.json`)
  }
}
