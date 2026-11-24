import type { FileOperationQueue } from '@app/base/node/fileOperationQueue'
import type {
  DeleteSessionResult,
  ISessionsService,
  SessionDocument,
  SessionSummary,
} from '../common/sessions'
import { SessionRepository } from '../node/sessionRepository'

export class SessionsMainService implements ISessionsService {
  declare readonly _serviceBrand: undefined

  private readonly repository: SessionRepository

  constructor(
    sessionsDirectoryOrRepository: string | SessionRepository,
    fileQueue?: FileOperationQueue,
  ) {
    this.repository =
      typeof sessionsDirectoryOrRepository === 'string'
        ? new SessionRepository(sessionsDirectoryOrRepository, fileQueue)
        : sessionsDirectoryOrRepository
  }

  initialize(): Promise<void> {
    return this.repository.initialize()
  }

  listSessions(): Promise<SessionSummary[]> {
    return this.repository.list()
  }

  createSession(title?: string): Promise<SessionDocument> {
    return this.repository.create(title)
  }

  getSession(id: string): Promise<SessionDocument> {
    return this.repository.get(id)
  }

  renameSession(id: string, title: string): Promise<SessionDocument> {
    return this.repository.rename(id, title)
  }

  setSessionPinned(id: string, pinned: boolean): Promise<SessionDocument> {
    return this.repository.setPinned(id, pinned)
  }

  deleteSession(id: string): Promise<DeleteSessionResult> {
    return this.repository.delete(id)
  }

  deleteAllSessions(): Promise<SessionDocument> {
    return this.repository.deleteAll()
  }
}
