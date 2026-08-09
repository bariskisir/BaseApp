/**
 * Exposes renderer commands for generic session workspace management.
 */

import { useCallback } from 'react'
import { App as AntdApp } from 'antd'
import { useTranslation } from 'react-i18next'
import { createLogger } from '@renderer/services/LoggerService'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import {
  addSessionSummary,
  removeSessionSummary,
  replaceCurrentSession,
  replaceSessionSummary,
  setCurrentSession,
} from '@renderer/store/appSlice'
import { toSessionSummary } from '@renderer/utils/formatters'

const logger = createLogger('SessionActions')
let selectionRevision = 0

interface SessionActions {
  /** Creates and selects a generic session workspace. */
  createSession(): Promise<void>
  /** Deletes one session while retaining a usable workspace. */
  deleteSession(id: string): Promise<void>
  /** Loads and selects one complete session. */
  openSession(id: string): Promise<void>
  /** Renames a session and reports whether persistence succeeded. */
  renameSession(id: string, title: string): Promise<boolean>
}

/** Returns stable local session management commands. */
export const useSessionActions = (): SessionActions => {
  const dispatch = useAppDispatch()
  const sessions = useAppSelector((state) => state.app.sessions)
  const currentSessionId = useAppSelector((state) => state.app.currentSession?.id ?? null)
  const { message } = AntdApp.useApp()
  const { t } = useTranslation()

  /** Loads a complete session from local storage. */
  const openSession = useCallback(
    async (id: string): Promise<void> => {
      const revision = ++selectionRevision
      try {
        const session = await window.app.getSession(id)
        if (revision === selectionRevision) dispatch(setCurrentSession(session))
      } catch (error) {
        if (revision !== selectionRevision) return
        logger.error('Session could not be loaded.', error)
        void message.error(t('errors.generic'))
      }
    },
    [dispatch, message, t],
  )

  /** Creates and selects a new session workspace. */
  const createSession = useCallback(async (): Promise<void> => {
    const revision = ++selectionRevision
    try {
      const session = await window.app.createSession()
      dispatch(addSessionSummary(toSessionSummary(session)))
      if (revision === selectionRevision) dispatch(setCurrentSession(session))
    } catch (error) {
      logger.error('Session workspace could not be created.', error)
      void message.error(t('errors.generic'))
    }
  }, [dispatch, message, t])

  /** Renames a session and synchronizes the active document and summary. */
  const renameSession = useCallback(
    async (id: string, title: string): Promise<boolean> => {
      try {
        const session = await window.app.renameSession(id, title)
        dispatch(replaceCurrentSession(session))
        dispatch(replaceSessionSummary(toSessionSummary(session)))
        return true
      } catch (error) {
        logger.error('Session could not be renamed.', error)
        void message.error(t('errors.generic'))
        return false
      }
    },
    [dispatch, message, t],
  )

  /** Deletes one session while preserving and selecting a ready workspace. */
  const deleteSession = useCallback(
    async (id: string): Promise<void> => {
      const revision = ++selectionRevision
      try {
        const result = await window.app.deleteSession(id)
        if (!result.deleted) return
        dispatch(removeSessionSummary(id))
        const remaining = sessions.filter((item) => item.id !== id)
        if (result.replacement) dispatch(addSessionSummary(toSessionSummary(result.replacement)))

        if (currentSessionId !== id) return
        const nextSession =
          result.replacement ?? (remaining[0] ? await window.app.getSession(remaining[0].id) : null)
        if (revision === selectionRevision) dispatch(setCurrentSession(nextSession))
      } catch (error) {
        logger.error('Session could not be deleted.', error)
        void message.error(t('errors.generic'))
      }
    },
    [currentSessionId, dispatch, sessions, message, t],
  )

  return { createSession, deleteSession, openSession, renameSession }
}
