import { $, clearNode, toggleClass } from '@app/base/browser/dom'
import { setUnexpectedErrorHandler } from '@app/base/common/errors'
import { Disposable, toDisposable } from '@app/base/common/lifecycle'
import type { DesktopPlatform } from '@app/base/common/platform'
import {
  IConfigurationService,
  type ResolvedThemeMode,
} from '@app/platform/configuration/common/configuration'
import { getSingletonServiceDescriptors } from '@app/platform/instantiation/common/extensions'
import type { IInstantiationService } from '@app/platform/instantiation/common/instantiation'
import { InstantiationService } from '@app/platform/instantiation/common/instantiationService'
import type { ServiceCollection } from '@app/platform/instantiation/common/serviceCollection'
import { ILocalizationService } from '@app/platform/localization/common/localization'
import { ILogService } from '@app/platform/log/common/log'
import { IThemeService } from '@app/platform/theme/common/themeService'
import { AuxiliaryBarPart } from '@app/workbench/browser/parts/auxiliarybar/auxiliaryBarPart'
import { EditorPart } from '@app/workbench/browser/parts/editor/editorPart'
import { NotificationsPart } from '@app/workbench/browser/parts/notifications/notificationsPart'
import { StartupOverlay } from '@app/workbench/browser/parts/notifications/startupOverlay'
import { SidebarPart } from '@app/workbench/browser/parts/sidebar/sidebarPart'
import { StatusbarPart } from '@app/workbench/browser/parts/statusbar/statusbarPart'
import { TertiaryBarPart } from '@app/workbench/browser/parts/tertiarybar/tertiaryBarPart'
import { TitlebarPart } from '@app/workbench/browser/parts/titlebar/titlebarPart'
import {
  WorkbenchPhase,
  getWorkbenchContributionsRegistry,
} from '@app/workbench/common/contributions'
import { IWorkbenchConfigurationService } from '@app/workbench/services/configuration/browser/workbenchConfigurationService'
import { IWorkbenchLayoutService } from '@app/workbench/services/layout/browser/layoutService'
import { IWorkbenchLifecycleService } from '@app/workbench/services/lifecycle/browser/lifecycleService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { IWorkbenchLogService } from '@app/workbench/services/log/browser/rendererLogService'
import { INotificationService } from '@app/workbench/services/notification/browser/notificationService'
import { IWorkbenchSessionsService } from '@app/workbench/services/sessions/browser/sessionsWorkbenchService'
import { IWorkbenchThemeService } from '@app/workbench/services/themes/browser/workbenchThemeService'
import { IWorkbenchUpdateService } from '@app/workbench/services/update/browser/updateWorkbenchService'

function toPlatformClass(platform: DesktopPlatform): string {
  if (platform === 'win32') {
    return 'windows'
  }
  if (platform === 'darwin') {
    return 'mac'
  }
  return 'linux'
}

export class Workbench extends Disposable {
  private workbenchElement: HTMLDivElement | undefined
  private startupOverlay: StartupOverlay | undefined

  constructor(
    private readonly container: HTMLElement,
    private readonly serviceCollection: ServiceCollection,
  ) {
    super()
  }

  initServices(serviceCollection: ServiceCollection): IInstantiationService {
    for (const [id, descriptor] of getSingletonServiceDescriptors()) {
      if (!serviceCollection.has(id)) {
        serviceCollection.set(id, descriptor)
      }
    }

    const instantiationService = this._register(new InstantiationService(serviceCollection, true))

    const logService = instantiationService.invokeFunction((accessor) =>
      accessor.get(IWorkbenchLogService),
    )
    serviceCollection.set(ILogService, logService)

    const configurationService = instantiationService.invokeFunction((accessor) =>
      accessor.get(IWorkbenchConfigurationService),
    )
    serviceCollection.set(IConfigurationService, configurationService)

    const localizationService = instantiationService.invokeFunction((accessor) =>
      accessor.get(IWorkbenchLocalizationService),
    )
    serviceCollection.set(ILocalizationService, localizationService)

    const themeService = instantiationService.invokeFunction((accessor) =>
      accessor.get(IWorkbenchThemeService),
    )
    serviceCollection.set(IThemeService, themeService)

    const notificationService = instantiationService.invokeFunction((accessor) =>
      accessor.get(INotificationService),
    )

    this.registerGlobalErrorHandlers(logService, localizationService, notificationService)

    return instantiationService
  }

  async startup(): Promise<IInstantiationService> {
    const instantiationService = this.initServices(this.serviceCollection)
    this.mountShell(instantiationService)
    await this.bootstrap(instantiationService)
    return instantiationService
  }

  private mountShell(instantiationService: IInstantiationService): void {
    const configurationService = instantiationService.invokeFunction((accessor) =>
      accessor.get(IWorkbenchConfigurationService),
    )
    const themeService = instantiationService.invokeFunction((accessor) =>
      accessor.get(IWorkbenchThemeService),
    )
    const layoutService = instantiationService.invokeFunction((accessor) =>
      accessor.get(IWorkbenchLayoutService),
    )
    const localizationService = instantiationService.invokeFunction((accessor) =>
      accessor.get(IWorkbenchLocalizationService),
    )

    clearNode(this.container)

    const workbenchElement = $<HTMLDivElement>('div.monaco-workbench')
    this.workbenchElement = workbenchElement
    this.syncPlatformClass(workbenchElement, configurationService.platform)
    this.syncThemeClass(workbenchElement, themeService.resolvedTheme)
    this.syncLayoutClasses(workbenchElement, layoutService)
    this.container.appendChild(workbenchElement)
    this._register(
      toDisposable(() => {
        workbenchElement.remove()
        if (this.workbenchElement === workbenchElement) {
          this.workbenchElement = undefined
        }
      }),
    )

    this._register(
      themeService.onDidColorThemeChange(() => {
        this.syncThemeClass(workbenchElement, themeService.resolvedTheme)
      }),
    )

    this._register(
      configurationService.onDidChangeConfiguration(() => {
        this.syncPlatformClass(workbenchElement, configurationService.platform)
        this.syncLayoutClasses(workbenchElement, layoutService)
      }),
    )

    this._register(
      layoutService.onDidChangeLayout(() => {
        this.syncLayoutClasses(workbenchElement, layoutService)
      }),
    )

    const titlebarPart = this._register(instantiationService.createInstance(TitlebarPart))
    titlebarPart.create(workbenchElement)

    const bodyElement = $<HTMLDivElement>('div.monaco-workbench-body')
    workbenchElement.appendChild(bodyElement)

    const sidebarPart = this._register(instantiationService.createInstance(SidebarPart))
    sidebarPart.create(bodyElement)

    const centerElement = $<HTMLDivElement>('div.monaco-workbench-center')
    bodyElement.appendChild(centerElement)

    const editorPart = this._register(instantiationService.createInstance(EditorPart))
    editorPart.create(centerElement)

    const tertiaryBarPart = this._register(instantiationService.createInstance(TertiaryBarPart))
    tertiaryBarPart.create(centerElement)

    const auxiliaryBarPart = this._register(instantiationService.createInstance(AuxiliaryBarPart))
    auxiliaryBarPart.create(bodyElement)

    const statusbarPart = this._register(instantiationService.createInstance(StatusbarPart))
    statusbarPart.create(workbenchElement)

    const notificationsPart = this._register(instantiationService.createInstance(NotificationsPart))
    notificationsPart.create(workbenchElement)

    const startupOverlay = this._register(new StartupOverlay(workbenchElement))
    this.startupOverlay = startupOverlay
    startupOverlay.showLoading(localizationService.t('common.loading'))
  }

  private async bootstrap(instantiationService: IInstantiationService): Promise<void> {
    const logService = instantiationService.invokeFunction((accessor) =>
      accessor.get(IWorkbenchLogService),
    )
    const localizationService = instantiationService.invokeFunction((accessor) =>
      accessor.get(IWorkbenchLocalizationService),
    )
    const configurationService = instantiationService.invokeFunction((accessor) =>
      accessor.get(IWorkbenchConfigurationService),
    )
    const themeService = instantiationService.invokeFunction((accessor) =>
      accessor.get(IWorkbenchThemeService),
    )
    const layoutService = instantiationService.invokeFunction((accessor) =>
      accessor.get(IWorkbenchLayoutService),
    )
    const sessionsService = instantiationService.invokeFunction((accessor) =>
      accessor.get(IWorkbenchSessionsService),
    )
    const updateService = instantiationService.invokeFunction((accessor) =>
      accessor.get(IWorkbenchUpdateService),
    )
    const lifecycleService = instantiationService.invokeFunction((accessor) =>
      accessor.get(IWorkbenchLifecycleService),
    )

    layoutService.setInitializationError(false)
    this.startupOverlay?.showLoading(localizationService.t('common.loading'))

    try {
      await localizationService.initialize()
      await configurationService.initialize()
      await themeService.initialize()

      if (this.workbenchElement) {
        this.syncPlatformClass(this.workbenchElement, configurationService.platform)
        this.syncThemeClass(this.workbenchElement, themeService.resolvedTheme)
        this.syncLayoutClasses(this.workbenchElement, layoutService)
      }

      instantiationService.invokeFunction((accessor) => {
        getWorkbenchContributionsRegistry().start(accessor)
      })
      lifecycleService.setPhase(WorkbenchPhase.BlockRestore)

      await Promise.all([
        layoutService.initialize(),
        sessionsService.initialize(),
        updateService.initialize(),
      ])

      if (this.isDisposed) {
        return
      }

      layoutService.markInitialized()
      this.startupOverlay?.hide()
      lifecycleService.setPhase(WorkbenchPhase.AfterRestored)
      queueMicrotask(() => {
        if (!this.isDisposed) {
          lifecycleService.setPhase(WorkbenchPhase.Eventually)
        }
      })
    } catch (error) {
      logService.error('Workbench', 'Workbench initialization failed.', error)
      layoutService.setInitializationError(true)
      this.startupOverlay?.showError(
        localizationService.t('errors.startup'),
        localizationService.t('common.retry'),
        () => {
          void this.bootstrap(instantiationService)
        },
      )
    }
  }

  private syncPlatformClass(element: HTMLElement, platform: DesktopPlatform): void {
    element.classList.remove('windows', 'mac', 'linux')
    element.classList.add(toPlatformClass(platform))
  }

  private syncThemeClass(element: HTMLElement, resolvedTheme: ResolvedThemeMode): void {
    toggleClass(element, 'vs-dark', resolvedTheme === 'dark')
    toggleClass(element, 'vs', resolvedTheme === 'light')
  }

  private syncLayoutClasses(element: HTMLElement, layoutService: IWorkbenchLayoutService): void {
    toggleClass(element, 'sidebar-right', layoutService.sideBarPosition === 'right')
    toggleClass(element, 'fullscreen', layoutService.fullScreen)
  }

  private registerGlobalErrorHandlers(
    logService: IWorkbenchLogService,
    localizationService: IWorkbenchLocalizationService,
    notificationService: INotificationService,
  ): void {
    const notifyUnexpectedError = (): void => {
      if (!this.isDisposed) {
        notificationService.error(localizationService.t('errors.unexpected'))
      }
    }

    setUnexpectedErrorHandler((error) => {
      logService.error('Workbench', 'Unexpected workbench error.', error)
      notifyUnexpectedError()
    })

    if (typeof window === 'undefined') {
      return
    }

    const onWindowError = (event: ErrorEvent): void => {
      logService.error('Renderer', 'Uncaught window error.', event.error ?? event.message)
      notifyUnexpectedError()
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
      logService.error('Renderer', 'Unhandled promise rejection.', event.reason)
      notifyUnexpectedError()
    }

    window.addEventListener('error', onWindowError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)

    this._register(
      toDisposable(() => {
        if (typeof window !== 'undefined') {
          window.removeEventListener('error', onWindowError)
          window.removeEventListener('unhandledrejection', onUnhandledRejection)
        }
      }),
    )
  }
}
