/**
 * Exposes the durable settings and generic session storage owned by the desktop shell.
 */

import { join } from 'node:path'
import type {
  AppSettings,
  AppSettingsPatch,
  DeleteSessionResult,
  SessionDocument,
  SessionSummary,
} from '@shared/types'
import SessionRepository from '../storage/SessionRepository'
import SettingsRepository from '../storage/SettingsRepository'

/** Composes the repositories that own every durable document below the data root. */
export default class StorageService {
  private readonly settings: SettingsRepository
  private readonly sessions: SessionRepository

  /** Creates a storage service rooted in the private application data directory. */
  public constructor(rootPath: string) {
    this.settings = new SettingsRepository(join(rootPath, 'settings.json'))
    this.sessions = new SessionRepository(join(rootPath, 'sessions'))
  }

  /** Creates required directories and removes obsolete interrupted-write files. */
  public async initialize(): Promise<void> {
    await Promise.all([this.settings.initialize(), this.sessions.initialize()])
  }

  /** Loads validated settings or safe defaults for missing or malformed data. */
  public async loadSettings(): Promise<AppSettings> {
    return this.settings.load()
  }

  /** Atomically merges changed fields into the latest validated settings document. */
  public async updateSettings(patch: AppSettingsPatch): Promise<AppSettings> {
    return this.settings.update(patch)
  }

  /** Creates a new empty generic session. */
  public async createSession(title?: string): Promise<SessionDocument> {
    return this.sessions.create(title)
  }

  /** Loads and validates one complete session. */
  public async getSession(id: string): Promise<SessionDocument> {
    return this.sessions.get(id)
  }

  /** Lists compact session summaries in reverse chronological order. */
  public async listSessions(): Promise<SessionSummary[]> {
    return this.sessions.list()
  }

  /** Renames one session and returns the updated document. */
  public async renameSession(id: string, title: string): Promise<SessionDocument> {
    return this.sessions.rename(id, title)
  }

  /** Deletes a session and creates a replacement when it was the final workspace. */
  public async deleteSession(id: string): Promise<DeleteSessionResult> {
    return this.sessions.delete(id)
  }

  /** Deletes every session and returns a fresh empty workspace as the replacement. */
  public async deleteAllSessions(): Promise<SessionDocument> {
    return this.sessions.deleteAll()
  }
}
