/**
 * Composes main-process services and controls the Electron application lifecycle.
 */

import { app, BrowserWindow } from 'electron'
import { APP_ID, APP_NAME } from '@shared/appInfo'
import { configureApplicationPaths } from './ApplicationPaths'
import { registerIpc } from './ipc'
import AppUpdater from './services/AppUpdater'
import LoggerService from './services/LoggerService'
import StorageService from './services/StorageService'
import TelemetryService from './telemetry/telemetry.service'
import TrayService from './services/TrayService'
import WindowService from './services/WindowService'

const applicationPaths = configureApplicationPaths()
const windowService = new WindowService(applicationPaths.dataRoot)
const telemetryService = new TelemetryService(applicationPaths.dataRoot)
const hasSingleInstanceLock = app.requestSingleInstanceLock()
let loggerService: LoggerService | null = null
let trayService: TrayService | null = null

/** Creates all services and binds them to a newly opened window. */
const openApplicationWindow = async (): Promise<void> => {
  const storage = new StorageService(applicationPaths.dataRoot)
  await storage.initialize()
  const settings = await storage.loadSettings()
  const logger = new LoggerService(applicationPaths.logsRoot, settings.logLevel)
  loggerService = logger
  void telemetryService
    .trackStartup({
      appName: APP_NAME,
      enabled: settings.telemetryEnabled,
      version: app.getVersion(),
      platform: process.platform,
      locale: settings.uiLanguage,
    })
    .catch((error: unknown) => {
      logger.warn('TelemetryService', 'Startup telemetry could not be sent.', error)
    })

  const updater = new AppUpdater(logger)
  updater.applySettings(settings)
  const window = await windowService.createWindow(logger)
  trayService?.dispose()
  const tray = new TrayService(window, settings, logger)
  trayService = tray

  window.on('close', (event) => {
    if (!tray.shouldMinimizeOnClose()) return
    event.preventDefault()
    window.hide()
  })
  registerIpc(window, { storage, tray, updater, logger })

  logger.info('Application', `${APP_NAME} desktop started.`, {
    version: app.getVersion(),
    platform: process.platform,
  })
  if (settings.autoUpdate && app.isPackaged) {
    void updater.checkForUpdates().catch((error: unknown) => {
      logger.warn('Application', 'Startup update check failed.', error)
    })
  }
}

/** Opens a replacement macOS window and records initialization failures. */
const reopenApplicationWindow = (): void => {
  void openApplicationWindow().catch((error: unknown) => {
    loggerService?.error('Application', 'Application window could not be reopened.', error)
  })
}

process.on('uncaughtException', (error) =>
  loggerService?.error('Application', 'Uncaught exception.', error),
)
process.on('unhandledRejection', (error) =>
  loggerService?.error('Application', 'Unhandled rejection.', error),
)

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = windowService.getMainWindow()
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })
  void app
    .whenReady()
    .then(async () => {
      app.setAppUserModelId(APP_ID)
      await openApplicationWindow()
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) reopenApplicationWindow()
      })
    })
    .catch((error: unknown) => {
      loggerService?.error('Application', 'Application initialization failed.', error)
      app.quit()
    })
}

app.on('before-quit', () => {
  trayService?.prepareToQuit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
