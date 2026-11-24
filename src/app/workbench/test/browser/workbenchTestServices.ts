import { Emitter, Event } from '@app/base/common/event'
import type { DisposableStore } from '@app/base/common/lifecycle'
import type { IChannel } from '@app/base/parts/ipc/common/ipc'
import { ICommandService } from '@app/platform/commands/common/commands'
import {
  type AppConfiguration,
  type AppConfigurationPatch,
  DEFAULT_CONFIGURATION,
  IConfigurationService,
} from '@app/platform/configuration/common/configuration'
import { CONFIGURATION_CHANNEL_NAME } from '@app/platform/configuration/common/configurationIpc'
import { TestInstantiationService } from '@app/platform/instantiation/test/common/instantiationServiceMock'
import { ILocalizationService } from '@app/platform/localization/common/localization'
import { ILogService } from '@app/platform/log/common/log'
import { LOG_CHANNEL_NAME } from '@app/platform/log/common/logIpc'
import { INativeHostService, type RuntimeInfo } from '@app/platform/native/common/native'
import { IProductService, ProductService } from '@app/platform/product/common/productService'
import type { SessionDocument } from '@app/platform/sessions/common/sessions'
import { SESSIONS_CHANNEL_NAME } from '@app/platform/sessions/common/sessionsIpc'
import type { IColorScheme } from '@app/platform/theme/common/theme'
import { THEME_CHANNEL_NAME } from '@app/platform/theme/common/themeIpc'
import { IThemeService } from '@app/platform/theme/common/themeService'
import type { UpdateStateEvent } from '@app/platform/update/common/update'
import { UPDATE_CHANNEL_NAME } from '@app/platform/update/common/updateIpc'
import { DEFAULT_SIDEBAR_STATE, type SidebarState } from '@app/platform/window/common/window'
import { CommandService } from '@app/workbench/services/commands/browser/commandService'
import {
  IWorkbenchConfigurationService,
  WorkbenchConfigurationService,
} from '@app/workbench/services/configuration/browser/workbenchConfigurationService'
import {
  ContextMenuService,
  IContextMenuService,
} from '@app/workbench/services/contextmenu/browser/contextMenuService'
import { DialogService, IDialogService } from '@app/workbench/services/dialog/browser/dialogService'
import { IMainProcessService } from '@app/workbench/services/ipc/electron-browser/mainProcessService'
import {
  IWorkbenchLayoutService,
  WorkbenchLayoutService,
} from '@app/workbench/services/layout/browser/layoutService'
import {
  IWorkbenchLifecycleService,
  WorkbenchLifecycleService,
} from '@app/workbench/services/lifecycle/browser/lifecycleService'
import {
  IWorkbenchLocalizationService,
  WorkbenchLocalizationService,
} from '@app/workbench/services/localization/browser/localizationService'
import {
  IWorkbenchLogService,
  RendererLogService,
} from '@app/workbench/services/log/browser/rendererLogService'
import {
  INotificationService,
  NotificationService,
} from '@app/workbench/services/notification/browser/notificationService'
import {
  IWorkbenchSessionsService,
  SessionsWorkbenchService,
} from '@app/workbench/services/sessions/browser/sessionsWorkbenchService'
import {
  IWorkbenchThemeService,
  WorkbenchThemeService,
} from '@app/workbench/services/themes/browser/workbenchThemeService'
import {
  IWorkbenchUpdateService,
  UpdateWorkbenchService,
} from '@app/workbench/services/update/browser/updateWorkbenchService'
import {
  IViewDescriptorService,
  ViewDescriptorService,
} from '@app/workbench/services/views/browser/viewDescriptorService'
import { vi } from 'vitest'

export interface WorkbenchTestContext {
  readonly instantiationService: TestInstantiationService
  readonly configurationService: WorkbenchConfigurationService
  readonly layoutService: WorkbenchLayoutService
  readonly viewDescriptorService: ViewDescriptorService
  readonly sessionsService: SessionsWorkbenchService
  readonly localizationService: WorkbenchLocalizationService
  readonly themeService: WorkbenchThemeService
  readonly updateService: UpdateWorkbenchService
  readonly notificationService: NotificationService
  readonly commandService: CommandService
  readonly contextMenuService: ContextMenuService
  readonly dialogService: DialogService
  readonly logService: RendererLogService
  readonly nativeHost: INativeHostService
  readonly updateStateEmitter: Emitter<UpdateStateEvent>
  readonly colorSchemeEmitter: Emitter<IColorScheme>
  readonly maximizedEmitter: Emitter<boolean>
  readonly fullScreenEmitter: Emitter<boolean>
  readonly openSettingsEmitter: Emitter<void>
  readonly openExternalSpy: ReturnType<typeof vi.fn>
}

export async function createWorkbenchTestContext(
  disposables: Pick<DisposableStore, 'add'>,
  options?: { readonly platform?: 'win32' | 'darwin' | 'linux' },
): Promise<WorkbenchTestContext> {
  const platform = options?.platform ?? 'win32'
  let storedConfig: AppConfiguration = { ...DEFAULT_CONFIGURATION }
  let sidebarState: SidebarState = { ...DEFAULT_SIDEBAR_STATE }
  let activeSessionId: string | null = null
  const now = new Date().toISOString()
  const sessions = new Map<string, SessionDocument>([
    [
      '11111111-1111-4111-8111-111111111111',
      {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Project Alpha',
        isDefaultTitle: false,
        pinned: true,
        createdAt: now,
        updatedAt: now,
        data: { ready: true },
      },
    ],
    [
      '22222222-2222-4222-8222-222222222222',
      {
        id: '22222222-2222-4222-8222-222222222222',
        title: 'New Session',
        isDefaultTitle: true,
        pinned: false,
        createdAt: now,
        updatedAt: now,
        data: {},
      },
    ],
  ])

  const configPush = disposables.add(new Emitter<AppConfiguration>())
  const colorSchemeEmitter = disposables.add(new Emitter<IColorScheme>())
  const updateStateEmitter = disposables.add(new Emitter<UpdateStateEvent>())
  const maximizedEmitter = disposables.add(new Emitter<boolean>())
  const fullScreenEmitter = disposables.add(new Emitter<boolean>())
  const openSettingsEmitter = disposables.add(new Emitter<void>())
  let updateState: UpdateStateEvent = { state: 'idle' }

  const channels: Record<string, IChannel> = {
    [CONFIGURATION_CHANNEL_NAME]: {
      async call<T>(command: string, arg?: unknown): Promise<T> {
        if (command === 'getConfiguration') {
          return { ...storedConfig } as T
        }
        if (command === 'updateConfiguration') {
          const patch = arg as AppConfigurationPatch
          const next: Record<string, unknown> = { ...storedConfig }
          for (const [key, value] of Object.entries(patch)) {
            if (value !== undefined) {
              next[key] = value
            }
          }
          storedConfig = next as unknown as AppConfiguration
          return { ...storedConfig } as T
        }
        if (command === 'resetConfiguration') {
          storedConfig = { ...DEFAULT_CONFIGURATION }
          return { ...storedConfig } as T
        }
        throw new Error(`Unknown config command: ${command}`)
      },
      listen: <T>() => configPush.event as Event<T>,
    },
    [SESSIONS_CHANNEL_NAME]: {
      async call<T>(command: string, arg?: unknown): Promise<T> {
        if (command === 'listSessions') {
          return [...sessions.values()].map(({ data: _d, ...rest }) => rest) as T
        }
        if (command === 'getSession') {
          return sessions.get(arg as string) as T
        }
        if (command === 'createSession') {
          const id = `33333333-3333-4333-8333-${String(sessions.size + 1).padStart(12, '0')}`
          const doc: SessionDocument = {
            id,
            title: (arg as string | undefined) ?? 'New Session',
            isDefaultTitle: !arg,
            pinned: false,
            createdAt: now,
            updatedAt: now,
            data: {},
          }
          sessions.set(id, doc)
          return doc as T
        }
        if (command === 'renameSession') {
          const [id, title] = arg as [string, string]
          const existing = sessions.get(id)
          if (!existing) {
            throw new Error(`Missing session ${id}`)
          }
          const updated = { ...existing, title, isDefaultTitle: false }
          sessions.set(id, updated)
          return updated as T
        }
        if (command === 'setSessionPinned') {
          const [id, pinned] = arg as [string, boolean]
          const existing = sessions.get(id)
          if (!existing) {
            throw new Error(`Missing session ${id}`)
          }
          const updated = { ...existing, pinned }
          sessions.set(id, updated)
          return updated as T
        }
        if (command === 'deleteSession') {
          sessions.delete(arg as string)
          return { deleted: true } as T
        }
        if (command === 'deleteAllSessions') {
          sessions.clear()
          const fresh: SessionDocument = {
            id: '99999999-9999-4999-8999-999999999999',
            title: 'New Session',
            isDefaultTitle: true,
            pinned: false,
            createdAt: now,
            updatedAt: now,
            data: {},
          }
          sessions.set(fresh.id, fresh)
          return fresh as T
        }
        throw new Error(`Unknown sessions command: ${command}`)
      },
      listen: () => Event.None,
    },
    [THEME_CHANNEL_NAME]: {
      async call<T>(command: string): Promise<T> {
        if (command === 'getColorScheme') {
          return { dark: true } as T
        }
        return undefined as T
      },
      listen: <T>() => colorSchemeEmitter.event as Event<T>,
    },
    [UPDATE_CHANNEL_NAME]: {
      async call<T>(command: string): Promise<T> {
        if (command === 'getState') {
          return updateState as T
        }
        if (command === 'checkForUpdates') {
          updateState = { state: 'up-to-date', version: '2.0.0' }
          updateStateEmitter.fire(updateState)
        }
        return undefined as T
      },
      listen: <T>() => updateStateEmitter.event as Event<T>,
    },
    [LOG_CHANNEL_NAME]: {
      async call<T>(command: string): Promise<T> {
        if (command === 'getLogsSummary') {
          return { fileCount: 2, totalBytes: 2048 } as T
        }
        if (command === 'clearLogs') {
          return { fileCount: 0, totalBytes: 0 } as T
        }
        return undefined as T
      },
      listen: () => Event.None,
    },
  }

  const mainProcessService: IMainProcessService = {
    _serviceBrand: undefined,
    getChannel: (name) => {
      const channel = channels[name]
      if (!channel) {
        throw new Error(`Unknown channel: ${name}`)
      }
      return channel
    },
  }

  const openExternalSpy = vi.fn(async () => undefined)
  const runtimeInfo: RuntimeInfo = {
    appVersion: '2.0.0',
    electron: '45.4.1',
    chromium: '138.0.0',
    node: '24.0.0',
    v8: '13.8.0',
    os: 'Windows_NT 10.0',
    arch: 'x64',
    platform,
  }

  const nativeHost: INativeHostService = {
    _serviceBrand: undefined,
    onDidChangeWindowMaximized: maximizedEmitter.event,
    onDidChangeWindowFullScreen: fullScreenEmitter.event,
    onDidRequestOpenSettings: openSettingsEmitter.event,
    getPlatform: async () => platform,
    getVersion: async () => '2.0.0',
    getRuntimeInfo: async () => runtimeInfo,
    getSidebarState: async () => ({ ...sidebarState }),
    setSidebarState: async (next) => {
      sidebarState = { ...next }
    },
    getActiveSessionId: async () => activeSessionId,
    setActiveSessionId: async (id) => {
      activeSessionId = id
    },
    resetWindowLayout: vi.fn(async () => {
      sidebarState = { ...DEFAULT_SIDEBAR_STATE }
      return { ...DEFAULT_SIDEBAR_STATE }
    }),
    setAlwaysOnTop: vi.fn(async () => undefined),
    setOpacity: vi.fn(async (v: number) => v),
    getOpacity: async () => 1,
    minimizeWindow: vi.fn(async () => undefined),
    toggleMaximizeWindow: vi.fn(async () => true),
    isWindowMaximized: async () => false,
    toggleFullScreen: vi.fn(async () => true),
    isFullScreen: async () => false,
    closeWindow: vi.fn(async () => undefined),
    openExternal: openExternalSpy,
    openDataDirectory: vi.fn(async () => undefined),
    openLogsDirectory: vi.fn(async () => undefined),
    exportConfiguration: vi.fn(async () => ({
      status: 'completed' as const,
      filePath: '/cfg.json',
    })),
    importConfiguration: vi.fn(async () => ({
      status: 'completed' as const,
      configuration: { ...storedConfig },
    })),
    relaunch: vi.fn(async () => undefined),
  }

  const instantiationService = disposables.add(new TestInstantiationService())
  const productService = new ProductService('2.0.0')
  const notificationService = disposables.add(new NotificationService())
  const logService = disposables.add(new RendererLogService(mainProcessService, nativeHost))
  const configurationService = disposables.add(
    new WorkbenchConfigurationService(
      mainProcessService,
      nativeHost,
      logService,
      notificationService,
    ),
  )
  const localizationService = disposables.add(
    new WorkbenchLocalizationService(configurationService, logService),
  )
  const themeService = disposables.add(
    new WorkbenchThemeService(mainProcessService, configurationService, logService),
  )
  const layoutService = disposables.add(
    new WorkbenchLayoutService(
      nativeHost,
      configurationService,
      logService,
      notificationService,
      localizationService,
    ),
  )
  const sessionsService = disposables.add(
    new SessionsWorkbenchService(
      mainProcessService,
      nativeHost,
      logService,
      notificationService,
      localizationService,
    ),
  )
  const updateService = disposables.add(
    new UpdateWorkbenchService(
      mainProcessService,
      logService,
      notificationService,
      localizationService,
    ),
  )
  const lifecycleService = disposables.add(new WorkbenchLifecycleService())
  const contextMenuService = disposables.add(new ContextMenuService())
  const dialogService = disposables.add(new DialogService())
  const commandService = disposables.add(new CommandService(instantiationService, logService))
  const viewDescriptorService = disposables.add(
    new ViewDescriptorService(layoutService, instantiationService),
  )

  instantiationService.set(IMainProcessService, mainProcessService)
  instantiationService.set(INativeHostService, nativeHost)
  instantiationService.set(IProductService, productService)
  instantiationService.set(INotificationService, notificationService)
  instantiationService.set(IWorkbenchLogService, logService)
  instantiationService.set(ILogService, logService)
  instantiationService.set(IWorkbenchConfigurationService, configurationService)
  instantiationService.set(IConfigurationService, configurationService)
  instantiationService.set(IWorkbenchLocalizationService, localizationService)
  instantiationService.set(ILocalizationService, localizationService)
  instantiationService.set(IWorkbenchThemeService, themeService)
  instantiationService.set(IThemeService, themeService)
  instantiationService.set(IWorkbenchLayoutService, layoutService)
  instantiationService.set(IWorkbenchSessionsService, sessionsService)
  instantiationService.set(IWorkbenchUpdateService, updateService)
  instantiationService.set(IWorkbenchLifecycleService, lifecycleService)
  instantiationService.set(IContextMenuService, contextMenuService)
  instantiationService.set(IDialogService, dialogService)
  instantiationService.set(ICommandService, commandService)
  instantiationService.set(IViewDescriptorService, viewDescriptorService)

  await localizationService.initialize()
  await configurationService.initialize()
  await themeService.initialize()
  await Promise.all([
    layoutService.initialize(),
    sessionsService.initialize(),
    updateService.initialize(),
  ])

  return {
    instantiationService,
    configurationService,
    layoutService,
    viewDescriptorService,
    sessionsService,
    localizationService,
    themeService,
    updateService,
    notificationService,
    commandService,
    contextMenuService,
    dialogService,
    logService,
    nativeHost,
    updateStateEmitter,
    colorSchemeEmitter,
    maximizedEmitter,
    fullScreenEmitter,
    openSettingsEmitter,
    openExternalSpy,
  }
}
