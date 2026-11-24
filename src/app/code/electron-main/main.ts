import { setUnexpectedErrorHandler, toErrorMessage } from '@app/base/common/errors'
import { DisposableStore, toDisposable } from '@app/base/common/lifecycle'
import { FileOperationQueue } from '@app/base/node/fileOperationQueue'
import { IConfigurationService } from '@app/platform/configuration/common/configuration'
import { ConfigurationMainService } from '@app/platform/configuration/electron-main/configurationMainService'
import { IEnvironmentService } from '@app/platform/environment/common/environment'
import {
  type ApplicationPaths,
  EnvironmentMainService,
  IEnvironmentMainService,
  configureApplicationPaths,
} from '@app/platform/environment/electron-main/environmentMainService'
import { SyncDescriptor } from '@app/platform/instantiation/common/descriptors'
import { InstantiationService } from '@app/platform/instantiation/common/instantiationService'
import { ServiceCollection } from '@app/platform/instantiation/common/serviceCollection'
import { ILifecycleMainService } from '@app/platform/lifecycle/common/lifecycle'
import { LifecycleMainService } from '@app/platform/lifecycle/electron-main/lifecycleMainService'
import { ILogService, ILoggerMainService } from '@app/platform/log/common/log'
import { LoggerMainService } from '@app/platform/log/electron-main/loggerMainService'
import { INativeHostService } from '@app/platform/native/common/native'
import { NativeHostMainService } from '@app/platform/native/electron-main/nativeHostMainService'
import {
  APP_ID,
  APP_SLUG,
  IProductService,
  ProductService,
} from '@app/platform/product/common/productService'
import {
  ExternalUrlPolicy,
  IExternalUrlPolicy,
} from '@app/platform/security/common/externalUrlPolicy'
import { ISessionsService } from '@app/platform/sessions/common/sessions'
import { SessionsMainService } from '@app/platform/sessions/electron-main/sessionsMainService'
import { IStateService } from '@app/platform/state/common/state'
import { StateService } from '@app/platform/state/node/stateService'
import { ITelemetryService } from '@app/platform/telemetry/common/telemetry'
import { TelemetryMainService } from '@app/platform/telemetry/electron-main/telemetryMainService'
import {
  IThemeMainService,
  ThemeMainService,
} from '@app/platform/theme/electron-main/themeMainService'
import { ITrayMainService } from '@app/platform/tray/common/tray'
import { TrayMainService } from '@app/platform/tray/electron-main/trayMainService'
import { IUpdateService } from '@app/platform/update/common/update'
import { createElectronUpdateRuntime } from '@app/platform/update/electron-main/electronUpdateRuntime'
import { GitHubReleaseClient } from '@app/platform/update/electron-main/githubReleaseClient'
import { httpFetch } from '@app/platform/update/electron-main/httpFetch'
import { UpdateMainService } from '@app/platform/update/electron-main/updateMainService'
import { IWindowManager, WindowManager } from '@app/platform/window/electron-main/windowManager'
import { app } from 'electron'
import { CodeApplication } from './app'

export class CodeMain {
  private readonly disposables = new DisposableStore()
  private logService: ILogService | null = null
  private lifecycleMainService: ILifecycleMainService | null = null

  constructor(private readonly applicationPaths?: ApplicationPaths) {}

  async main(): Promise<void> {
    this.installErrorHandlers()

    if (!app.requestSingleInstanceLock()) {
      app.quit()
      return
    }

    try {
      await app.whenReady()
      await this.startup()
    } catch (error) {
      this.handleFatalStartupError(error)
    }
  }

  private async startup(): Promise<void> {
    const paths = this.applicationPaths ?? configureApplicationPaths(app, APP_SLUG)
    const environmentMainService = EnvironmentMainService.fromElectronApp(paths, app)

    if (environmentMainService.platform === 'win32') {
      app.setAppUserModelId(APP_ID)
    }

    const [instantiationService, lifecycleMainService] =
      await this.createServices(environmentMainService)
    this.lifecycleMainService = lifecycleMainService

    this.disposables.add(
      lifecycleMainService.onWillShutdown((event) => {
        event.join(
          'codeMain',
          Promise.resolve().then(() => {
            this.disposables.dispose()
          }),
        )
      }),
    )

    const codeApplication = this.disposables.add(
      instantiationService.createInstance(CodeApplication),
    )
    await codeApplication.startup()
  }

  private async createServices(
    environmentMainService: EnvironmentMainService,
  ): Promise<readonly [InstantiationService, LifecycleMainService]> {
    const productService = new ProductService(app.getVersion())
    const lifecycleMainService = this.disposables.add(new LifecycleMainService(app))
    const stateService = this.disposables.add(
      new StateService(environmentMainService.windowStatePath),
    )
    const fileQueue = new FileOperationQueue()
    const configurationService = this.disposables.add(
      new ConfigurationMainService(
        environmentMainService.settingsPath,
        environmentMainService.platform,
        fileQueue,
      ),
    )
    const sessionsService = new SessionsMainService(
      environmentMainService.sessionsDirectory,
      fileQueue,
    )

    await Promise.all([configurationService.initialize(), sessionsService.initialize()])

    const loggerMainService = this.disposables.add(
      new LoggerMainService(
        environmentMainService.logsDirectory,
        configurationService.getValue('logLevel'),
      ),
    )
    this.logService = loggerMainService

    const updateMainService = this.disposables.add(
      new UpdateMainService(
        loggerMainService,
        new GitHubReleaseClient(httpFetch, productService),
        createElectronUpdateRuntime(),
      ),
    )

    const services = new ServiceCollection()
    services.set(IProductService, productService)
    services.set(IEnvironmentMainService, environmentMainService)
    services.set(IEnvironmentService, environmentMainService)
    services.set(ILifecycleMainService, lifecycleMainService)
    services.set(IExternalUrlPolicy, new SyncDescriptor(ExternalUrlPolicy))
    services.set(IStateService, stateService)
    services.set(IConfigurationService, configurationService)
    services.set(ILoggerMainService, loggerMainService)
    services.set(ILogService, loggerMainService)
    services.set(ISessionsService, sessionsService)
    services.set(IThemeMainService, new SyncDescriptor(ThemeMainService))
    services.set(IWindowManager, new SyncDescriptor(WindowManager))
    services.set(ITrayMainService, new SyncDescriptor(TrayMainService))
    services.set(IUpdateService, updateMainService)
    services.set(ITelemetryService, new SyncDescriptor(TelemetryMainService))
    services.set(INativeHostService, new SyncDescriptor(NativeHostMainService))

    const instantiationService = this.disposables.add(new InstantiationService(services, true))
    return [instantiationService, lifecycleMainService]
  }

  private installErrorHandlers(): void {
    setUnexpectedErrorHandler((error) => {
      this.logError('Unexpected error.', error)
    })

    const onUncaughtException = (error: Error): void => {
      this.logError('Uncaught exception.', error)
    }

    const onUnhandledRejection = (reason: unknown): void => {
      this.logError('Unhandled rejection.', reason)
    }

    process.on('uncaughtException', onUncaughtException)
    process.on('unhandledRejection', onUnhandledRejection)

    this.disposables.add(
      toDisposable(() => {
        process.removeListener('uncaughtException', onUncaughtException)
        process.removeListener('unhandledRejection', onUnhandledRejection)
      }),
    )
  }

  private handleFatalStartupError(error: unknown): void {
    this.logError('Application startup failed.', error)
    this.lifecycleMainService?.markQuitting()
    this.disposables.dispose()
    app.quit()
  }

  private logError(message: string, error: unknown): void {
    if (this.logService) {
      this.logService.error('CodeMain', message, error)
      return
    }
    console.error(`[CodeMain] ${message}`, toErrorMessage(error, true))
  }
}
