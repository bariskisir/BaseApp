import { createDecorator } from '@app/platform/instantiation/common/instantiation'
import { z } from 'zod'

export const MAX_SESSION_TITLE_LENGTH = 200

export type SessionData = Record<string, unknown>

export interface SessionDocument {
  id: string
  title: string
  isDefaultTitle: boolean
  pinned: boolean
  createdAt: string
  updatedAt: string
  data: SessionData
}

export interface SessionSummary {
  id: string
  title: string
  isDefaultTitle: boolean
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export interface DeleteSessionResult {
  deleted: boolean
  replacement?: SessionDocument | undefined
}

export const toSessionSummary = (session: SessionDocument): SessionSummary => ({
  id: session.id,
  title: session.title,
  isDefaultTitle: session.isDefaultTitle,
  pinned: session.pinned,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
})

export const compareSessionSummaries = (left: SessionSummary, right: SessionSummary): number => {
  if (left.pinned !== right.pinned) {
    return left.pinned ? -1 : 1
  }
  const updatedOrder = right.updatedAt.localeCompare(left.updatedAt)
  if (updatedOrder !== 0) {
    return updatedOrder
  }
  return right.createdAt.localeCompare(left.createdAt)
}

export const sessionIdSchema = z.uuid()

export const sessionCreateTitleSchema = z.string().trim().max(MAX_SESSION_TITLE_LENGTH).optional()

export const sessionRenameSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(MAX_SESSION_TITLE_LENGTH),
})

export const sessionPinSchema = z.object({
  id: z.uuid(),
  pinned: z.boolean({ error: 'Invalid session pin state.' }),
})

export interface ISessionsService {
  readonly _serviceBrand: undefined
  listSessions(): Promise<SessionSummary[]>
  createSession(title?: string): Promise<SessionDocument>
  getSession(id: string): Promise<SessionDocument>
  renameSession(id: string, title: string): Promise<SessionDocument>
  setSessionPinned(id: string, pinned: boolean): Promise<SessionDocument>
  deleteSession(id: string): Promise<DeleteSessionResult>
  deleteAllSessions(): Promise<SessionDocument>
}

export const ISessionsService = createDecorator<ISessionsService>('sessionsService')
