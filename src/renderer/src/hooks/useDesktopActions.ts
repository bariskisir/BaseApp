/**
 * Wraps fallible desktop-shell commands with consistent renderer diagnostics.
 */

import { useCallback } from 'react'
import { App as AntdApp } from 'antd'
import { useTranslation } from 'react-i18next'
import { createLogger } from '@renderer/services/LoggerService'

const logger = createLogger('DesktopActions')

interface DesktopActions {
  /** Checks GitHub Releases for a newer application version. */
  checkForUpdates(): Promise<void>
  /** Installs the downloaded application update. */
  installUpdate(): Promise<void>
  /** Opens an allow-listed URL in the operating-system browser. */
  openExternal(url: string): Promise<void>
  /** Opens the application log directory. */
  openLogsDirectory(): Promise<void>
}

/** Returns safe commands for external links, logs, and application updates. */
export const useDesktopActions = (): DesktopActions => {
  const { message } = AntdApp.useApp()
  const { t } = useTranslation()

  /** Opens an allow-listed external URL in the operating-system browser. */
  const openExternal = useCallback(
    async (url: string): Promise<void> => {
      try {
        await window.app.openExternal(url)
      } catch (error) {
        logger.error('External URL could not be opened.', error)
        void message.error(t('errors.generic'))
      }
    },
    [message, t],
  )

  /** Opens the application log directory in the operating-system file manager. */
  const openLogsDirectory = useCallback(async (): Promise<void> => {
    try {
      await window.app.openLogsDirectory()
    } catch (error) {
      logger.error('Log directory could not be opened.', error)
      void message.error(t('errors.generic'))
    }
  }, [message, t])

  /** Checks GitHub Releases while preventing rejected IPC calls from escaping the UI. */
  const checkForUpdates = useCallback(async (): Promise<void> => {
    try {
      await window.app.checkForUpdates()
    } catch (error) {
      logger.error('Application update check failed.', error)
    }
  }, [])

  /** Installs a downloaded update while reporting a rejected restart request. */
  const installUpdate = useCallback(async (): Promise<void> => {
    try {
      await window.app.installUpdate()
    } catch (error) {
      logger.error('Downloaded application update could not be installed.', error)
      void message.error(t('errors.generic'))
    }
  }, [message, t])

  return { checkForUpdates, installUpdate, openExternal, openLogsDirectory }
}
