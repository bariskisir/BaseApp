import { Emitter, type Event } from '@app/base/common/event'
import { Disposable } from '@app/base/common/lifecycle'
import { InstantiationType, registerSingleton } from '@app/platform/instantiation/common/extensions'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'
import { ILogService } from '@app/platform/log/common/log'
import { INativeHostService } from '@app/platform/native/common/native'
import {
  type SessionDocument,
  type SessionSummary,
  compareSessionSummaries,
  toSessionSummary,
} from '@app/platform/sessions/common/sessions'
import {
  SESSIONS_CHANNEL_NAME,
  SessionsChannelClient,
} from '@app/platform/sessions/common/sessionsIpc'
import { IMainProcessService } from '@app/workbench/services/ipc/electron-browser/mainProcessService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { INotificationService } from '@app/workbench/services/notification/browser/notificationService'

export interface IWorkbenchSessionsService {
  readonly _serviceBrand: undefined
  readonly sessions: readonly SessionSummary[]
  readonly currentSession: SessionDocument | null
  readonly isOnlyEmptySession: boolean
  readonly onDidChangeSessions: Event<void>
  initialize(): Promise<void>
  openSession(id: string): Promise<void>
  createSession(title?: string): Promise<void>
  renameSession(id: string, title: string): Promise<boolean>
  toggleSessionPinned(id: string, pinned: boolean): Promise<void>
  deleteSession(id: string): Promise<void>
  deleteAllSessions(): Promise<void>
}

export const IWorkbenchSessionsService = createDecorator<IWorkbenchSessionsService>(
  'workbenchSessionsService',
)

export class SessionsWorkbenchService extends Disposable implements IWorkbenchSessionsService {
  declare readonly _serviceBrand: undefined

  private readonly _onDidChangeSessions = this._register(new Emitter<void>())
  readonly onDidChangeSessions: Event<void> = this._onDidChangeSessions.event

  private readonly channelClient: SessionsChannelClient
  private _sessions: SessionSummary[] = []
  private _currentSession: SessionDocument | null = null
  private latestSelectionRevision = 0
  private lastPersistedSessionId: string | null = null

  constructor(
    @IMainProcessService mainProcessService: IMainProcessService,
    @INativeHostService private readonly nativeHostService: INativeHostService,
    @ILogService private readonly logService: ILogService,
    @INotificationService private readonly notificationService: INotificationService,
    @IWorkbenchLocalizationService
    private readonly localizationService: IWorkbenchLocalizationService,
  ) {
    super()
    this.channelClient = new SessionsChannelClient(
      mainProcessService.getChannel(SESSIONS_CHANNEL_NAME),
    )
  }

  get sessions(): readonly SessionSummary[] {
    return this._sessions
  }

  get currentSession(): SessionDocument | null {
    return this._currentSession
  }

  get isOnlyEmptySession(): boolean {
    return (
      this._sessions.length === 1 &&
      this._currentSession !== null &&
      this._sessions[0]?.id === this._currentSession.id &&
      Object.keys(this._currentSession.data).length === 0
    )
  }

  async initialize(): Promise<void> {
    const [listed, persistedActiveId] = await Promise.all([
      this.channelClient.listSessions(),
      this.nativeHostService.getActiveSessionId(),
    ])
    const sorted = [...listed].sort(compareSessionSummaries)
    const firstSummary = sorted[0]

    if (!firstSummary) {
      const created = await this.channelClient.createSession()
      this._sessions = [toSessionSummary(created)]
      this.setCurrentSession(created, true)
      this._onDidChangeSessions.fire()
      return
    }

    const preferredId =
      persistedActiveId && sorted.some((summary) => summary.id === persistedActiveId)
        ? persistedActiveId
        : firstSummary.id

    const active = await this.loadInitialSession(preferredId, firstSummary.id)
    this._sessions = sorted
    this.upsertSessionSummary(toSessionSummary(active))

    if (persistedActiveId === active.id) {
      this.lastPersistedSessionId = active.id
      this._currentSession = active
    } else {
      this.setCurrentSession(active, true)
    }

    this._onDidChangeSessions.fire()
  }

  async openSession(id: string): Promise<void> {
    const revision = this.beginSelection()
    try {
      const session = await this.channelClient.getSession(id)
      if (this.isLatestSelection(revision)) {
        this.setCurrentSession(session, true)
        this._onDidChangeSessions.fire()
      }
    } catch (error) {
      if (!this.isLatestSelection(revision)) {
        return
      }
      this.reportFailure('Session could not be loaded.', error)
    }
  }

  async createSession(title?: string): Promise<void> {
    const revision = this.beginSelection()
    try {
      const session = await this.channelClient.createSession(title)
      this.upsertSessionSummary(toSessionSummary(session))
      if (this.isLatestSelection(revision)) {
        this.setCurrentSession(session, true)
      }
      this._onDidChangeSessions.fire()
    } catch (error) {
      this.reportFailure('Session workspace could not be created.', error)
    }
  }

  async renameSession(id: string, title: string): Promise<boolean> {
    try {
      const session = await this.channelClient.renameSession(id, title)
      if (this._currentSession?.id === session.id) {
        this._currentSession = session
      }
      this.upsertSessionSummary(toSessionSummary(session))
      this._onDidChangeSessions.fire()
      return true
    } catch (error) {
      this.reportFailure('Session could not be renamed.', error)
      return false
    }
  }

  async toggleSessionPinned(id: string, pinned: boolean): Promise<void> {
    try {
      const session = await this.channelClient.setSessionPinned(id, pinned)
      if (this._currentSession?.id === session.id) {
        this._currentSession = session
      }
      this.upsertSessionSummary(toSessionSummary(session))
      this._onDidChangeSessions.fire()
    } catch (error) {
      this.reportFailure('Session pin state could not be updated.', error)
    }
  }

  async deleteSession(id: string): Promise<void> {
    const revision = this.beginSelection()
    try {
      const result = await this.channelClient.deleteSession(id)
      if (!result.deleted) {
        return
      }
      this._sessions = this._sessions.filter((item) => item.id !== id)
      if (result.replacement) {
        this.upsertSessionSummary(toSessionSummary(result.replacement))
      }

      if (this._currentSession?.id === id) {
        const nextSummary = this._sessions[0]
        const nextSession =
          result.replacement ??
          (nextSummary ? await this.channelClient.getSession(nextSummary.id) : null)
        if (this.isLatestSelection(revision)) {
          this.setCurrentSession(nextSession, true)
        }
      }

      this._onDidChangeSessions.fire()
    } catch (error) {
      this.reportFailure('Session could not be deleted.', error)
    }
  }

  async deleteAllSessions(): Promise<void> {
    const revision = this.beginSelection()
    try {
      const replacement = await this.channelClient.deleteAllSessions()
      this._sessions = [toSessionSummary(replacement)]
      if (this.isLatestSelection(revision)) {
        this.setCurrentSession(replacement, true)
      }
      this._onDidChangeSessions.fire()
    } catch (error) {
      this.reportFailure('Sessions could not be deleted.', error)
    }
  }

  private async loadInitialSession(
    preferredId: string,
    fallbackId: string,
  ): Promise<SessionDocument> {
    try {
      return await this.channelClient.getSession(preferredId)
    } catch (error) {
      this.logService.warn(
        'SessionsWorkbenchService',
        'Preferred session could not be restored.',
        error,
      )
      if (preferredId !== fallbackId) {
        try {
          return await this.channelClient.getSession(fallbackId)
        } catch (fallbackError) {
          this.logService.warn(
            'SessionsWorkbenchService',
            'Fallback session could not be restored.',
            fallbackError,
          )
        }
      }
      return this.channelClient.createSession()
    }
  }

  private beginSelection(): number {
    this.latestSelectionRevision += 1
    return this.latestSelectionRevision
  }

  private isLatestSelection(revision: number): boolean {
    return revision === this.latestSelectionRevision
  }

  private upsertSessionSummary(summary: SessionSummary): void {
    this._sessions = [summary, ...this._sessions.filter((item) => item.id !== summary.id)].sort(
      compareSessionSummaries,
    )
  }

  private setCurrentSession(session: SessionDocument | null, persist: boolean): void {
    this._currentSession = session
    if (!persist || !session || this.isDisposed) {
      return
    }
    if (this.lastPersistedSessionId === session.id) {
      return
    }
    this.lastPersistedSessionId = session.id
    void this.nativeHostService.setActiveSessionId(session.id).catch((error: unknown) => {
      this.logService.warn(
        'SessionsWorkbenchService',
        'Active session identifier could not be persisted.',
        error,
      )
    })
  }

  private reportFailure(message: string, error: unknown): void {
    this.logService.error('SessionsWorkbenchService', message, error)
    this.notificationService.error(this.localizationService.t('errors.generic'))
  }
}

registerSingleton(IWorkbenchSessionsService, SessionsWorkbenchService, InstantiationType.Eager)
