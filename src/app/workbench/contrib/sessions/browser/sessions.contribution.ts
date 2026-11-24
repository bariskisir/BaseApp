import { CommandsRegistry } from '@app/platform/commands/common/commands'
import { registerView } from '@app/workbench/common/views'
import { IWorkbenchSessionsService } from '@app/workbench/services/sessions/browser/sessionsWorkbenchService'
import { SESSIONS_VIEW_ID, createSessionsView } from './sessionsView'

export const SESSIONS_COMMANDS = {
  newSession: 'sessions.new',
  deleteAll: 'sessions.deleteAll',
  open: 'sessions.open',
  rename: 'sessions.rename',
  togglePin: 'sessions.togglePin',
  delete: 'sessions.delete',
} as const

registerView({
  id: SESSIONS_VIEW_ID,
  titleKey: 'nav.sessions',
  iconId: 'files',
  order: 10,
  defaultLocation: 'sidebar',
  canMoveView: true,
  factory: () => createSessionsView,
})

CommandsRegistry.registerCommand(SESSIONS_COMMANDS.newSession, (accessor, title?: unknown) =>
  accessor
    .get(IWorkbenchSessionsService)
    .createSession(typeof title === 'string' ? title : undefined),
)

CommandsRegistry.registerCommand(SESSIONS_COMMANDS.deleteAll, (accessor) =>
  accessor.get(IWorkbenchSessionsService).deleteAllSessions(),
)

CommandsRegistry.registerCommand(SESSIONS_COMMANDS.open, (accessor, id?: unknown) => {
  if (typeof id !== 'string') {
    return Promise.resolve()
  }
  return accessor.get(IWorkbenchSessionsService).openSession(id)
})

CommandsRegistry.registerCommand(
  SESSIONS_COMMANDS.rename,
  (accessor, id?: unknown, title?: unknown) => {
    if (typeof id !== 'string' || typeof title !== 'string') {
      return Promise.resolve(false)
    }
    return accessor.get(IWorkbenchSessionsService).renameSession(id, title)
  },
)

CommandsRegistry.registerCommand(
  SESSIONS_COMMANDS.togglePin,
  (accessor, id?: unknown, pinned?: unknown) => {
    if (typeof id !== 'string' || typeof pinned !== 'boolean') {
      return Promise.resolve(false)
    }
    return accessor.get(IWorkbenchSessionsService).toggleSessionPinned(id, pinned)
  },
)

CommandsRegistry.registerCommand(SESSIONS_COMMANDS.delete, (accessor, id?: unknown) => {
  if (typeof id !== 'string') {
    return Promise.resolve()
  }
  return accessor.get(IWorkbenchSessionsService).deleteSession(id)
})
