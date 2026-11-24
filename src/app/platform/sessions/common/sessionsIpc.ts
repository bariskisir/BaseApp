import type { IChannel, IServerChannel } from '@app/base/parts/ipc/common/ipc'
import { ProxyChannel } from '@app/base/parts/ipc/common/proxyChannel'
import {
  type DeleteSessionResult,
  type ISessionsService,
  type SessionDocument,
  type SessionSummary,
  sessionCreateTitleSchema,
  sessionIdSchema,
  sessionPinSchema,
  sessionRenameSchema,
} from './sessions'

export const SESSIONS_CHANNEL_NAME = 'sessions'

type SessionsChannelTarget = Omit<ISessionsService, '_serviceBrand'>

function parseRenameArgs(arg: unknown): [string, string] {
  const candidate = Array.isArray(arg)
    ? arg.length === 2
      ? { id: arg[0], title: arg[1] }
      : null
    : arg
  const parsed = sessionRenameSchema.parse(candidate)
  return [parsed.id, parsed.title]
}

function parsePinArgs(arg: unknown): [string, boolean] {
  const candidate = Array.isArray(arg)
    ? arg.length === 2
      ? { id: arg[0], pinned: arg[1] }
      : null
    : arg
  const parsed = sessionPinSchema.parse(candidate)
  return [parsed.id, parsed.pinned]
}

export function createSessionsChannel(service: ISessionsService): IServerChannel<number> {
  const target: SessionsChannelTarget = {
    listSessions: (): Promise<SessionSummary[]> => service.listSessions(),
    createSession: (title?: string): Promise<SessionDocument> => service.createSession(title),
    getSession: (id: string): Promise<SessionDocument> => service.getSession(id),
    renameSession: (id: string, title: string): Promise<SessionDocument> =>
      service.renameSession(id, title),
    setSessionPinned: (id: string, pinned: boolean): Promise<SessionDocument> =>
      service.setSessionPinned(id, pinned),
    deleteSession: (id: string): Promise<DeleteSessionResult> => service.deleteSession(id),
    deleteAllSessions: (): Promise<SessionDocument> => service.deleteAllSessions(),
  }

  return ProxyChannel.fromService(target, {
    validators: {
      getSession: (arg: unknown): string => sessionIdSchema.parse(arg),
      createSession: (arg: unknown): string | undefined => sessionCreateTitleSchema.parse(arg),
      renameSession: parseRenameArgs,
      setSessionPinned: parsePinArgs,
      deleteSession: (arg: unknown): string => sessionIdSchema.parse(arg),
    },
  })
}

export class SessionsChannelClient implements ISessionsService {
  declare readonly _serviceBrand: undefined

  constructor(private readonly channel: IChannel) {}

  listSessions(): Promise<SessionSummary[]> {
    return this.channel.call<SessionSummary[]>('listSessions')
  }

  createSession(title?: string): Promise<SessionDocument> {
    return this.channel.call<SessionDocument>('createSession', title)
  }

  getSession(id: string): Promise<SessionDocument> {
    return this.channel.call<SessionDocument>('getSession', id)
  }

  renameSession(id: string, title: string): Promise<SessionDocument> {
    return this.channel.call<SessionDocument>('renameSession', [id, title])
  }

  setSessionPinned(id: string, pinned: boolean): Promise<SessionDocument> {
    return this.channel.call<SessionDocument>('setSessionPinned', [id, pinned])
  }

  deleteSession(id: string): Promise<DeleteSessionResult> {
    return this.channel.call<DeleteSessionResult>('deleteSession', id)
  }

  deleteAllSessions(): Promise<SessionDocument> {
    return this.channel.call<SessionDocument>('deleteAllSessions')
  }
}
