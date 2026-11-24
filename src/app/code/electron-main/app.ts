import { Disposable, MutableDisposable, toDisposable } from '@app/base/common/lifecycle'
import { isStartupLaunchSupported } from '@app/base/common/platform'
import { ElectronIpcServer } from '@app/base/parts/ipc/electron-main/ipcServer'
import {
  type AppConfiguration,
  IConfigurationService,
} from '@app/platform/configuration/common/configuration'
import {
  CONFIGURATION_CHANNEL_NAME,
  createConfigurationChannel,
} from '@app/platform/configuration/common/configurationIpc'
import { IEnvironmentMainService } from '@app/platform/environment/electron-main/environmentMainService'
import { ILifecycleMainService, LifecycleMainPhase } from '@app/platform/lifecycle/common/lifecycle'
import { ILoggerMainService } from '@app/platform/log/common/log'
import { LOG_CHANNEL_NAME, createLogChannel } from '@app/platform/log/common/logIpc'
import { INativeHostService } from '@app/platform/native/common/native'
import {
  NATIVE_HOST_CHANNEL_NAME,
  createNativeHostChannel,
} from '@app/platform/native/common/nativeIpc'
import { IProductService } from '@app/platform/product/common/productService'
import { ISessionsService } from '@app/platform/sessions/common/sessions'
import {
  SESSIONS_CHANNEL_NAME,
  createSessionsChannel,
} from '@app/platform/sessions/common/sessionsIpc'
import { ITelemetryService } from '@app/platform/telemetry/common/telemetry'
import {
  type IThemeChannelService,
  THEME_CHANNEL_NAME,
  createThemeChannel,
} from '@app/platform/theme/common/themeIpc'
import { IThemeMainService } from '@app/platform/theme/electron-main/themeMainService'
import { ITrayMainService } from '@app/platform/tray/common/tray'
import { IUpdateService } from '@app/platform/update/common/update'
import { UPDATE_CHANNEL_NAME, createUpdateChannel } from '@app/platform/update/common/updateIpc'
import { IWindowManager } from '@app/platform/window/electron-main/windowManager'
import { BrowserWindow, type Event as ElectronEvent, app } from 'electron'

interface ConfigurableUpdateService {
  applyConfiguration(config: Pick<AppConfiguration, 'autoUpdate' | 'unattendedUpdates'>): void
}

function isConfigurableUpdateService(
  service: IUpdateService,
): service is IUpdateService & ConfigurableUpdateService {
  return (
    'applyConfiguration' in service &&
    typeof (service as Partial<ConfigurableUpdateService>).applyConfiguration === 'function'
  )
}

export class CodeApplication extends Disposable {
  private readonly windowCloseListener = this._register(new MutableDisposable())
  private openingWindow: Promise<BrowserWindow> | null = null

  constructor(
    @IProductService private readonly productService: IProductService,
    @IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
    @ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
    @IConfigurationService private readonly configurationService: IConfigurationService,
    @ILoggerMainService private readonly loggerMainService: ILoggerMainService,
    @ISessionsService private readonly sessionsService: ISessionsService,
    @IThemeMainService private readonly themeMainService: IThemeMainService,
    @IWindowManager private readonly windowManager: IWindowManager,
    @ITrayMainService private readonly trayMainService: ITrayMainService,
    @IUpdateService private readonly updateService: IUpdateService,
    @ITelemetryService private readonly telemetryService: ITelemetryService,
    @INativeHostService private readonly nativeHostService: INativeHostService,
  ) {
    super()
  }

  async startup(): Promise<void> {
    this.lifecycleMainService.setPhase(LifecycleMainPhase.Ready)

    this.registerIpcChannels()
    this.registerListeners()

    const initialConfiguration = this.configurationService.getConfiguration()
    this.applyRuntimeConfiguration(initialConfiguration)

    await this.openMainWindow()
    this.lifecycleMainService.setPhase(LifecycleMainPhase.AfterWindowOpen)

    this.afterWindowOpen(initialConfiguration)
    this.lifecycleMainService.setPhase(LifecycleMainPhase.Eventually)
  }

  private registerIpcChannels(): void {
    const ipcServer = this._register(new ElectronIpcServer())

    ipcServer.registerChannel(
      CONFIGURATION_CHANNEL_NAME,
      createConfigurationChannel(this.configurationService),
    )
    ipcServer.registerChannel(SESSIONS_CHANNEL_NAME, createSessionsChannel(this.sessionsService))
    ipcServer.registerChannel(LOG_CHANNEL_NAME, createLogChannel(this.loggerMainService))
    ipcServer.registerChannel(
      THEME_CHANNEL_NAME,
      createThemeChannel(this.createThemeChannelService()),
    )
    ipcServer.registerChannel(
      NATIVE_HOST_CHANNEL_NAME,
      createNativeHostChannel(this.nativeHostService),
    )
    ipcServer.registerChannel(UPDATE_CHANNEL_NAME, createUpdateChannel(this.updateService))
  }

  private createThemeChannelService(): IThemeChannelService {
    return {
      getColorScheme: async () => this.themeMainService.getColorScheme(),
      setTitleBarTheme: async (theme) => {
        this.windowManager.setTitleBarTheme(theme)
      },
      onDidChangeColorScheme: this.themeMainService.onDidChangeColorScheme,
    }
  }

  private registerListeners(): void {
    this._register(
      this.configurationService.onDidChangeConfiguration((event) => {
        this.applyConfiguration(event.configuration)
      }),
    )

    this._register(
      this.lifecycleMainService.onBeforeShutdown(() => {
        this.trayMainService.prepareToQuit()
      }),
    )

    this._register(
      this.lifecycleMainService.onWillShutdown(() => {
        this.dispose()
      }),
    )

    const onSecondInstance = (): void => {
      this.windowManager.focusMainWindow()
    }

    const onActivate = (): void => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void this.openMainWindow().catch((error: unknown) => {
          this.loggerMainService.error(
            'CodeApplication',
            'Application window could not be reopened.',
            error,
          )
        })
        return
      }
      this.windowManager.focusMainWindow()
    }

    const onWindowAllClosed = (): void => {
      if (this.environmentMainService.platform !== 'darwin') {
        this.lifecycleMainService.quit()
      }
    }

    const onBeforeQuit = (): void => {
      this.lifecycleMainService.markQuitting()
      this.trayMainService.prepareToQuit()
    }

    app.on('second-instance', onSecondInstance)
    app.on('activate', onActivate)
    app.on('window-all-closed', onWindowAllClosed)
    app.on('before-quit', onBeforeQuit)

    this._register(
      toDisposable(() => {
        app.removeListener('second-instance', onSecondInstance)
        app.removeListener('activate', onActivate)
        app.removeListener('window-all-closed', onWindowAllClosed)
        app.removeListener('before-quit', onBeforeQuit)
      }),
    )
  }

  private async openMainWindow(): Promise<BrowserWindow> {
    if (this.openingWindow) {
      return this.openingWindow
    }
    this.openingWindow = this.createAndBindMainWindow().finally(() => {
      this.openingWindow = null
    })
    return this.openingWindow
  }

  private async createAndBindMainWindow(): Promise<BrowserWindow> {
    const configuration = this.configurationService.getConfiguration()
    const startMinimized = configuration.startMinimized && configuration.showTrayIcon
    const window = await this.windowManager.createWindow(startMinimized, configuration.theme)
    this.applyConfiguration(configuration)

    const onWindowClose = (event: ElectronEvent): void => {
      if (!this.lifecycleMainService.isQuitting && this.trayMainService.shouldMinimizeOnClose()) {
        event.preventDefault()
        window.hide()
      }
    }

    window.on('close', onWindowClose)
    this.windowCloseListener.value = toDisposable(() => {
      if (!window.isDestroyed()) {
        window.removeListener('close', onWindowClose)
      }
    })

    return window
  }

  private applyRuntimeConfiguration(configuration: AppConfiguration): void {
    this.loggerMainService.setLevel(configuration.logLevel)
    this.themeMainService.setThemeSource(configuration.theme)
    if (isConfigurableUpdateService(this.updateService)) {
      this.updateService.applyConfiguration(configuration)
    }
    this.syncLoginItemSettings(configuration)
  }

  private applyConfiguration(configuration: AppConfiguration): void {
    this.applyRuntimeConfiguration(configuration)
    this.windowManager.applyConfiguration(configuration)
    this.trayMainService.applyConfiguration(configuration)
  }

  private syncLoginItemSettings(configuration: AppConfiguration): void {
    if (
      !this.environmentMainService.isPackaged ||
      !isStartupLaunchSupported(this.environmentMainService.platform)
    ) {
      return
    }
    if (typeof app.setLoginItemSettings !== 'function') {
      return
    }
    app.setLoginItemSettings({
      openAtLogin: configuration.launchAtStartup,
      ...(this.environmentMainService.platform === 'darwin'
        ? { openAsHidden: configuration.showTrayIcon && configuration.startMinimized }
        : {}),
    })
  }

  private afterWindowOpen(configuration: AppConfiguration): void {
    this.loggerMainService.info('CodeApplication', `${this.productService.name} desktop started.`, {
      version: this.productService.version,
      platform: this.environmentMainService.platform,
    })

    void this.telemetryService.sendStartupEvent().catch((error: unknown) => {
      this.loggerMainService.warn('CodeApplication', 'Startup telemetry failed.', error)
    })

    if (configuration.autoUpdate && this.environmentMainService.isPackaged) {
      void this.updateService.checkForUpdates().catch((error: unknown) => {
        this.loggerMainService.warn('CodeApplication', 'Startup update check failed.', error)
      })
    }
  }
}
