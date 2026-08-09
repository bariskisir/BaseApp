/**
 * Defines the validated IPC boundary between the renderer and main-process services.
 */

import {
  app,
  ipcMain,
  shell,
  type BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron'
import { IpcChannel } from '@shared/IpcChannel'
import { APP_AUTHOR_URL } from '@shared/appInfo'
import { LOG_LEVELS, type UpdateStateEvent } from '@shared/types'
import { z } from 'zod'
import { normalizeSettingsForPlatform, settingsPatchSchema } from './settingsSchema'
import type AppUpdater from './services/AppUpdater'
import type LoggerService from './services/LoggerService'
import type StorageService from './services/StorageService'
import type TrayService from './services/TrayService'

const sessionIdSchema = z.uuid()
const sessionRenameSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
})
const rendererLogSchema = z.object({
  level: z.enum(LOG_LEVELS),
  module: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(1_000),
  details: z.string().max(8_000).optional(),
})

const TRUSTED_EXTERNAL_ORIGINS = new Set([
  new URL('https://github.com').origin,
  new URL(APP_AUTHOR_URL).origin,
])

interface IpcServices {
  storage: StorageService
  tray: TrayService
  updater: AppUpdater
  logger: LoggerService
}

/** Removes previous handlers before a replacement window is attached. */
export const removeIpcHandlers = (): void => {
  Object.values(IpcChannel).forEach((channel) => {
    ipcMain.removeHandler(channel)
  })
  ipcMain.removeAllListeners(IpcChannel.LogWrite)
}

/** Registers all renderer commands against explicit main-process services. */
export const registerIpc = (window: BrowserWindow, services: IpcServices): void => {
  removeIpcHandlers()

  /** Rejects any IPC call not originating from the main renderer. */
  const assertSender = (event: IpcMainEvent | IpcMainInvokeEvent): void => {
    if (
      event.sender.id !== window.webContents.id ||
      event.senderFrame !== window.webContents.mainFrame
    ) {
      throw new Error('Untrusted IPC sender.')
    }
  }

  /** Sends a typed event only while the window is alive. */
  const send = <T>(channel: IpcChannel, payload: T): void => {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }

  services.updater.initialize((event: UpdateStateEvent) => send(IpcChannel.UpdateState, event))
  window.on('maximize', () => send(IpcChannel.WindowMaximizedChanged, true))
  window.on('unmaximize', () => send(IpcChannel.WindowMaximizedChanged, false))

  ipcMain.handle(IpcChannel.AppBootstrap, async (event) => {
    assertSender(event)
    const [persistedSettings, initialSessions] = await Promise.all([
      services.storage.loadSettings(),
      services.storage.listSessions(),
    ])
    const settings = normalizeSettingsForPlatform(persistedSettings, process.platform)
    window.setAlwaysOnTop(settings.alwaysOnTop)
    window.webContents.setZoomFactor(settings.pageZoom)
    if (initialSessions.length === 0) await services.storage.createSession()
    const sessions =
      initialSessions.length === 0 ? await services.storage.listSessions() : initialSessions
    const firstSession = sessions[0]
    if (!firstSession) throw new Error('Session workspace could not be initialized.')
    return {
      settings,
      sessions,
      currentSession: await services.storage.getSession(firstSession.id),
      platform: process.platform,
      version: app.getVersion(),
    }
  })

  ipcMain.handle(IpcChannel.SettingsSave, async (event, input: unknown) => {
    assertSender(event)
    const patch = settingsPatchSchema.parse(input)
    if (process.platform === 'linux') {
      delete patch.showTrayIcon
      delete patch.minimizeToTrayOnClose
    }
    const persistedSettings = await services.storage.updateSettings(patch)
    const savedSettings = normalizeSettingsForPlatform(persistedSettings, process.platform)
    window.setAlwaysOnTop(savedSettings.alwaysOnTop)
    window.webContents.setZoomFactor(savedSettings.pageZoom)
    services.tray.applySettings(savedSettings)
    services.updater.applySettings(savedSettings)
    services.logger.setLevel(savedSettings.logLevel)
    return savedSettings
  })

  ipcMain.handle(IpcChannel.SessionCreate, async (event) => {
    assertSender(event)
    return services.storage.createSession()
  })
  ipcMain.handle(IpcChannel.SessionGet, async (event, input: unknown) => {
    assertSender(event)
    return services.storage.getSession(sessionIdSchema.parse(input))
  })
  ipcMain.handle(IpcChannel.SessionRename, async (event, input: unknown) => {
    assertSender(event)
    const { id, title } = sessionRenameSchema.parse(input)
    return services.storage.renameSession(id, title)
  })
  ipcMain.handle(IpcChannel.SessionDelete, async (event, input: unknown) => {
    assertSender(event)
    return services.storage.deleteSession(sessionIdSchema.parse(input))
  })
  ipcMain.handle(IpcChannel.SessionDeleteAll, async (event) => {
    assertSender(event)
    return services.storage.deleteAllSessions()
  })

  ipcMain.handle(IpcChannel.WindowAlwaysOnTop, (event, enabled: unknown) => {
    assertSender(event)
    if (typeof enabled !== 'boolean') throw new Error('Invalid window preference.')
    window.setAlwaysOnTop(enabled)
  })
  ipcMain.handle(IpcChannel.WindowMinimize, (event) => {
    assertSender(event)
    window.minimize()
  })
  ipcMain.handle(IpcChannel.WindowToggleMaximize, (event) => {
    assertSender(event)
    if (window.isMaximized()) {
      window.unmaximize()
      return false
    }
    window.maximize()
    return true
  })
  ipcMain.handle(IpcChannel.WindowClose, (event) => {
    assertSender(event)
    window.close()
  })
  ipcMain.handle(IpcChannel.WindowIsMaximized, (event) => {
    assertSender(event)
    return window.isMaximized()
  })
  ipcMain.handle(IpcChannel.ThemeSet, (event, theme: unknown) => {
    assertSender(event)
    if (theme !== 'light' && theme !== 'dark') throw new Error('Invalid theme.')
    if (process.platform === 'darwin') {
      window.setTitleBarOverlay({
        color: theme === 'dark' ? '#1f1f1f' : '#f4f4f4',
        symbolColor: theme === 'dark' ? '#ffffff99' : '#00000099',
        height: 42,
      })
    }
  })
  ipcMain.handle(IpcChannel.ShellOpenExternal, async (event, input: unknown) => {
    assertSender(event)
    if (typeof input !== 'string') throw new Error('Invalid external URL.')
    const url = new URL(input)
    if (!TRUSTED_EXTERNAL_ORIGINS.has(url.origin)) throw new Error('This URL is not allowed.')
    await shell.openExternal(url.toString())
  })
  ipcMain.handle(IpcChannel.LogsOpenDirectory, async (event) => {
    assertSender(event)
    const error = await shell.openPath(services.logger.getLogsDirectory())
    if (error) throw new Error(error)
  })
  ipcMain.on(IpcChannel.LogWrite, (event, input: unknown) => {
    assertSender(event)
    const parsed = rendererLogSchema.safeParse(input)
    if (parsed.success) {
      services.logger.writeRenderer({
        level: parsed.data.level,
        module: parsed.data.module,
        message: parsed.data.message,
        ...(parsed.data.details === undefined ? {} : { details: parsed.data.details }),
      })
    }
  })
  ipcMain.handle(IpcChannel.UpdatesCheck, async (event) => {
    assertSender(event)
    await services.updater.checkForUpdates()
  })
  ipcMain.handle(IpcChannel.UpdatesInstall, async (event) => {
    assertSender(event)
    await services.updater.quitAndInstall()
  })
}
