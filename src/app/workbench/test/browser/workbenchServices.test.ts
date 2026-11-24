import { Emitter, Event } from '@app/base/common/event'
import { DisposableStore } from '@app/base/common/lifecycle'
import type { IChannel } from '@app/base/parts/ipc/common/ipc'
import {
  type FakeDomHarness,
  type FakeElement,
  installFakeDom,
} from '@app/base/test/browser/fakeDom'
import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import { CommandsRegistry } from '@app/platform/commands/common/commands'
import {
  type AppConfiguration,
  type AppConfigurationPatch,
  DEFAULT_CONFIGURATION,
} from '@app/platform/configuration/common/configuration'
import { CONFIGURATION_CHANNEL_NAME } from '@app/platform/configuration/common/configurationIpc'
import { TestInstantiationService } from '@app/platform/instantiation/test/common/instantiationServiceMock'
import type { ILogService } from '@app/platform/log/common/log'
import { LOG_CHANNEL_NAME } from '@app/platform/log/common/logIpc'
import type { INativeHostService } from '@app/platform/native/common/native'
import type { SessionDocument } from '@app/platform/sessions/common/sessions'
import { SESSIONS_CHANNEL_NAME } from '@app/platform/sessions/common/sessionsIpc'
import type { IColorScheme } from '@app/platform/theme/common/theme'
import { THEME_CHANNEL_NAME } from '@app/platform/theme/common/themeIpc'
import type { UpdateStateEvent } from '@app/platform/update/common/update'
import { UPDATE_CHANNEL_NAME } from '@app/platform/update/common/updateIpc'
import {
  DEFAULT_AUXILIARY_BAR_STATE,
  DEFAULT_SIDEBAR_STATE,
  DEFAULT_TERTIARY_BAR_STATE,
  type SidebarState,
} from '@app/platform/window/common/window'
import { WorkbenchPhase } from '@app/workbench/common/contributions'
import { registerView } from '@app/workbench/common/views'
import { CommandService } from '@app/workbench/services/commands/browser/commandService'
import { WorkbenchConfigurationService } from '@app/workbench/services/configuration/browser/workbenchConfigurationService'
import { ContextMenuService } from '@app/workbench/services/contextmenu/browser/contextMenuService'
import { DialogService } from '@app/workbench/services/dialog/browser/dialogService'
import type { IMainProcessService } from '@app/workbench/services/ipc/electron-browser/mainProcessService'
import { WorkbenchLayoutService } from '@app/workbench/services/layout/browser/layoutService'
import { WorkbenchLifecycleService } from '@app/workbench/services/lifecycle/browser/lifecycleService'
import { WorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { RendererLogService } from '@app/workbench/services/log/browser/rendererLogService'
import { NotificationService } from '@app/workbench/services/notification/browser/notificationService'
import { SessionsWorkbenchService } from '@app/workbench/services/sessions/browser/sessionsWorkbenchService'
import { WorkbenchThemeService } from '@app/workbench/services/themes/browser/workbenchThemeService'
import { UpdateWorkbenchService } from '@app/workbench/services/update/browser/updateWorkbenchService'
import { ViewDescriptorService } from '@app/workbench/services/views/browser/viewDescriptorService'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function createMockMainProcessService(channels: Record<string, IChannel>): IMainProcessService {
  return {
    _serviceBrand: undefined,
    getChannel(name: string): IChannel {
      const channel = channels[name]
      if (!channel) {
        throw new Error(`Missing mock channel: ${name}`)
      }
      return channel
    },
  }
}

function createNoopLogService(): ILogService {
  let level: ReturnType<ILogService['getLevel']> = 'info'
  return {
    _serviceBrand: undefined,
    onDidChangeLogLevel: Event.None,
    getLevel: () => level,
    setLevel: (next) => {
      level = next
    },
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  }
}

describe('workbench services', () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite()
  let dom: FakeDomHarness

  beforeEach(() => {
    dom = installFakeDom()
  })

  afterEach(() => {
    dom.restore()
  })

  it('manages WorkbenchConfigurationService batching, shell warnings, import/export, and reset', async () => {
    let storedConfig: AppConfiguration = { ...DEFAULT_CONFIGURATION }
    const configPush = disposables.add(new Emitter<AppConfiguration>())
    const updateCalls: AppConfigurationPatch[] = []

    const configChannel: IChannel = {
      async call<T>(command: string, arg?: unknown): Promise<T> {
        if (command === 'getConfiguration') {
          return { ...storedConfig } as T
        }
        if (command === 'updateConfiguration') {
          const patch = arg as AppConfigurationPatch
          updateCalls.push(patch)
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
        throw new Error(`Unknown command ${command}`)
      },
      listen<T>() {
        return configPush.event as Event<T>
      },
    }

    const nativeHost = {
      getPlatform: async () => 'win32' as const,
      getVersion: async () => '2.0.0',
      exportConfiguration: vi.fn(async () => ({
        status: 'completed' as const,
        filePath: '/a.json',
      })),
      importConfiguration: vi.fn(async () => ({
        status: 'completed' as const,
        configuration: { ...DEFAULT_CONFIGURATION, uiLanguage: 'tr' as const },
      })),
    } as unknown as INativeHostService

    const notifications = disposables.add(new NotificationService())
    const service = disposables.add(
      new WorkbenchConfigurationService(
        createMockMainProcessService({ [CONFIGURATION_CHANNEL_NAME]: configChannel }),
        nativeHost,
        createNoopLogService(),
        notifications,
      ),
    )

    await service.initialize()
    expect(service.platform).toBe('win32')
    expect(service.version).toBe('2.0.0')
    expect(service.isTrayUnavailable()).toBe(false)
    expect(service.isStartupLaunchUnavailable()).toBe(false)
    expect(service.isHardwareAccelerationRestartRequired()).toBe(false)

    await Promise.all([
      service.updateConfiguration({ theme: 'dark' }),
      service.updateConfiguration({ showTaskbar: false, hardwareAcceleration: false }),
    ])
    expect(service.getValue('theme')).toBe('dark')
    expect(service.isWindowHiddenFromShell()).toBe(true)
    expect(service.isHardwareAccelerationRestartRequired()).toBe(true)
    expect(updateCalls.length).toBeGreaterThanOrEqual(1)

    expect(await service.exportConfiguration()).toBe(true)
    expect(await service.importConfiguration()).toBe(true)
    expect(service.getValue('uiLanguage')).toBe('tr')

    const importedDirect = await service.importConfiguration({ zoomLevel: 2 })
    expect(importedDirect.zoomLevel).toBe(2)
    await expect(service.importConfiguration('bad')).rejects.toThrow('JSON object')

    const reset = await service.resetConfiguration()
    expect(reset).toEqual(DEFAULT_CONFIGURATION)
  })

  it('manages WorkbenchLayoutService and ViewDescriptorService across Primary, Secondary, and Tertiary sidebars', async () => {
    let currentConfig: AppConfiguration = { ...DEFAULT_CONFIGURATION }
    const configEmitter = disposables.add(
      new Emitter<{
        configuration: AppConfiguration
        changedKeys: ReadonlySet<keyof AppConfiguration>
        affectsConfiguration(key: keyof AppConfiguration): boolean
      }>(),
    )
    const configService = {
      getConfiguration: () => currentConfig,
      getValue: <K extends keyof AppConfiguration>(key: K) => currentConfig[key],
      updateConfiguration: vi.fn(async (patch: AppConfigurationPatch) => {
        const changed = new Set<keyof AppConfiguration>()
        const next: Record<string, unknown> = { ...currentConfig }
        for (const [key, value] of Object.entries(patch)) {
          if (value !== undefined) {
            next[key] = value
            changed.add(key as keyof AppConfiguration)
          }
        }
        currentConfig = next as unknown as AppConfiguration
        configEmitter.fire({
          configuration: currentConfig,
          changedKeys: changed,
          affectsConfiguration: (k) => changed.has(k),
        })
        return currentConfig
      }),
      onDidChangeConfiguration: configEmitter.event,
    } as unknown as WorkbenchConfigurationService

    let persistedSidebar: SidebarState = {
      open: true,
      width: 170,
      compact: false,
      auxiliaryOpen: false,
      auxiliaryWidth: 170,
      tertiaryOpen: false,
      tertiaryHeight: 120,
    }
    const nativeHost = {
      getSidebarState: async () => ({ ...persistedSidebar }),
      setSidebarState: vi.fn(async (next: SidebarState) => {
        persistedSidebar = { ...next }
      }),
      isWindowMaximized: async () => false,
      isFullScreen: async () => false,
      toggleFullScreen: vi.fn(async () => true),
      resetWindowLayout: vi.fn(async () => ({ ...DEFAULT_SIDEBAR_STATE })),
    } as unknown as INativeHostService

    const notifications = disposables.add(new NotificationService())
    const localization = disposables.add(
      new WorkbenchLocalizationService(configService, createNoopLogService()),
    )
    await localization.initialize()

    const layout = disposables.add(
      new WorkbenchLayoutService(
        nativeHost,
        configService,
        createNoopLogService(),
        notifications,
        localization,
      ),
    )
    await layout.initialize()

    expect(layout.sidebarWidth).toBe(170)
    expect(layout.auxiliaryBarWidth).toBe(DEFAULT_AUXILIARY_BAR_STATE.width)
    expect(layout.tertiaryBarHeight).toBe(DEFAULT_TERTIARY_BAR_STATE.height)
    expect(layout.tertiaryBarOpen).toBe(false)

    layout.toggleTertiaryBar()
    expect(layout.tertiaryBarOpen).toBe(true)
    layout.setTertiaryBarHeight(180)
    expect(layout.tertiaryBarHeight).toBe(180)
    expect(persistedSidebar.tertiaryHeight).toBe(180)

    layout.toggleSettings()
    expect(layout.page).toBe('settings')
    layout.openSettings('appearance')
    expect(layout.settingsSection).toBe('appearance')
    await layout.toggleSideBarPosition()
    expect(layout.sideBarPosition).toBe('right')
    await layout.toggleStatusBarVisible()
    expect(layout.statusBarVisible).toBe(false)
    expect(await layout.toggleFullScreen()).toBe(true)
    expect(layout.fullScreen).toBe(true)

    const di = disposables.add(new TestInstantiationService())
    const viewDescriptorService = disposables.add(new ViewDescriptorService(layout, di))

    const regA = disposables.add(
      registerView({
        id: 'test.movable.primary',
        titleKey: 'nav.sessions',
        iconId: 'files',
        defaultLocation: 'sidebar',
        order: 1,
        canMoveView: true,
        factory: () => () => {
          const store = new DisposableStore()
          return {
            id: 'test.movable.primary',
            element: dom.document.createElement('div') as unknown as HTMLElement,
            onDidChangeHeaderActions: Event.None,
            getHeaderActions: () => [],
            dispose: () => store.dispose(),
          }
        },
      }),
    )

    expect(viewDescriptorService.getViewLocation('test.movable.primary')).toBe('sidebar')
    expect(viewDescriptorService.moveViewToLocation('test.movable.primary', 'tertiarybar')).toBe(
      true,
    )
    expect(viewDescriptorService.getViewLocation('test.movable.primary')).toBe('tertiarybar')
    expect(layout.sidebarOpen).toBe(false)
    expect(layout.tertiaryBarOpen).toBe(true)

    expect(viewDescriptorService.moveViewToLocation('test.movable.primary', 'auxiliarybar')).toBe(
      true,
    )
    expect(viewDescriptorService.getViewLocation('test.movable.primary')).toBe('auxiliarybar')
    expect(layout.tertiaryBarOpen).toBe(false)
    expect(layout.auxiliaryBarOpen).toBe(true)

    const pane = viewDescriptorService.getOrCreateViewPane('test.movable.primary')
    expect(pane).toBeDefined()
    expect(viewDescriptorService.getOrCreateViewPane('test.movable.primary')).toBe(pane)
    viewDescriptorService.openView('test.movable.primary')

    viewDescriptorService.resetViewLocations()
    expect(viewDescriptorService.getViewLocation('test.movable.primary')).toBe('sidebar')

    expect(await layout.resetLayout()).toBe(true)
    expect(layout.sideBarPosition).toBe('left')
    expect(layout.statusBarVisible).toBe(true)
    expect(layout.tertiaryBarHeight).toBe(120)

    regA.dispose()
  })

  it('manages SessionsWorkbenchService, WorkbenchThemeService, UpdateWorkbenchService, and support services', async () => {
    const now = new Date().toISOString()
    const sessionsMap = new Map<string, SessionDocument>([
      [
        's1',
        {
          id: 's1',
          title: 'First',
          isDefaultTitle: false,
          pinned: false,
          createdAt: now,
          updatedAt: now,
          data: {},
        },
      ],
    ])
    const sessionsChannel: IChannel = {
      async call<T>(command: string, arg?: unknown): Promise<T> {
        if (command === 'listSessions') {
          return [...sessionsMap.values()].map(({ data: _d, ...rest }) => rest) as T
        }
        if (command === 'getSession') {
          const found = sessionsMap.get(arg as string)
          if (!found) {
            throw new Error('Missing session')
          }
          return found as T
        }
        if (command === 'createSession') {
          const id = `s${sessionsMap.size + 1}`
          const doc: SessionDocument = {
            id,
            title: (arg as string | undefined) ?? 'New Session',
            isDefaultTitle: !arg,
            pinned: false,
            createdAt: now,
            updatedAt: now,
            data: {},
          }
          sessionsMap.set(id, doc)
          return doc as T
        }
        if (command === 'renameSession') {
          const [id, title] = arg as [string, string]
          const existing = sessionsMap.get(id)
          if (!existing) {
            throw new Error(`Missing session ${id}`)
          }
          const doc = { ...existing, title, isDefaultTitle: false }
          sessionsMap.set(id, doc)
          return doc as T
        }
        if (command === 'setSessionPinned') {
          const [id, pinned] = arg as [string, boolean]
          const existing = sessionsMap.get(id)
          if (!existing) {
            throw new Error(`Missing session ${id}`)
          }
          const doc = { ...existing, pinned }
          sessionsMap.set(id, doc)
          return doc as T
        }
        if (command === 'deleteSession') {
          sessionsMap.delete(arg as string)
          return { deleted: true } as T
        }
        if (command === 'deleteAllSessions') {
          sessionsMap.clear()
          const fresh: SessionDocument = {
            id: 'fresh',
            title: 'New Session',
            isDefaultTitle: true,
            pinned: false,
            createdAt: now,
            updatedAt: now,
            data: {},
          }
          sessionsMap.set('fresh', fresh)
          return fresh as T
        }
        throw new Error(`Unknown ${command}`)
      },
      listen: () => Event.None,
    }

    const schemeEmitter = disposables.add(new Emitter<IColorScheme>())
    const themeChannel: IChannel = {
      async call<T>(command: string): Promise<T> {
        if (command === 'getColorScheme') {
          return { dark: true } as T
        }
        return undefined as T
      },
      listen: <T>() => schemeEmitter.event as Event<T>,
    }

    const updateEmitter = disposables.add(new Emitter<UpdateStateEvent>())
    const updateChannel: IChannel = {
      async call<T>(command: string): Promise<T> {
        if (command === 'getState') {
          return { state: 'idle' } as T
        }
        return undefined as T
      },
      listen: <T>() => updateEmitter.event as Event<T>,
    }

    const logChannelCalls: string[] = []
    const logChannel: IChannel = {
      async call<T>(command: string): Promise<T> {
        logChannelCalls.push(command)
        return { fileCount: 1, totalBytes: 128 } as T
      },
      listen: () => Event.None,
    }

    const mainProcess = createMockMainProcessService({
      [SESSIONS_CHANNEL_NAME]: sessionsChannel,
      [THEME_CHANNEL_NAME]: themeChannel,
      [UPDATE_CHANNEL_NAME]: updateChannel,
      [LOG_CHANNEL_NAME]: logChannel,
    })

    const nativeHost = {
      getActiveSessionId: async () => 's1',
      setActiveSessionId: vi.fn(async () => undefined),
      openLogsDirectory: vi.fn(async () => undefined),
    } as unknown as INativeHostService

    const notifications = disposables.add(new NotificationService())
    const seenNotifications: string[] = []
    disposables.add(
      notifications.onDidNotify((m) => seenNotifications.push(`${m.severity}:${m.text}`)),
    )
    notifications.info('i')
    notifications.success('s')
    notifications.warning('w')
    notifications.error('e')
    notifications.info('')
    expect(seenNotifications).toEqual(['info:i', 'success:s', 'warning:w', 'error:e'])

    const configEmitter = disposables.add(
      new Emitter<{
        configuration: AppConfiguration
        changedKeys: ReadonlySet<keyof AppConfiguration>
        affectsConfiguration(key: keyof AppConfiguration): boolean
      }>(),
    )
    let cfg: AppConfiguration = { ...DEFAULT_CONFIGURATION }
    const configStub = {
      getValue: <K extends keyof AppConfiguration>(key: K) => cfg[key],
      onDidChangeConfiguration: configEmitter.event,
    } as unknown as WorkbenchConfigurationService

    const localization = disposables.add(
      new WorkbenchLocalizationService(configStub, createNoopLogService()),
    )
    await localization.initialize()
    expect(localization.t('settings.title')).toBe('Settings')
    cfg = { ...cfg, uiLanguage: 'tr' }
    configEmitter.fire({
      configuration: cfg,
      changedKeys: new Set(['uiLanguage']),
      affectsConfiguration: (k) => k === 'uiLanguage',
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(localization.locale).toBe('tr')
    expect(localization.getResource('en').settings.title).toBe('Settings')

    const sessions = disposables.add(
      new SessionsWorkbenchService(
        mainProcess,
        nativeHost,
        createNoopLogService(),
        notifications,
        localization,
      ),
    )
    await sessions.initialize()
    expect(sessions.isOnlyEmptySession).toBe(true)
    await sessions.createSession('Second')
    expect(sessions.sessions).toHaveLength(2)
    await sessions.renameSession('s1', 'Renamed')
    await sessions.toggleSessionPinned('s1', true)
    await sessions.openSession('s1')
    expect(sessions.currentSession?.title).toBe('Renamed')
    await sessions.deleteSession('s1')
    await sessions.deleteAllSessions()
    expect(sessions.sessions).toHaveLength(1)

    const themeService = disposables.add(
      new WorkbenchThemeService(mainProcess, configStub, createNoopLogService()),
    )
    await themeService.initialize()
    expect(themeService.resolvedTheme).toBe('dark')
    expect(themeService.generateCssRules()).toContain('--baseapp-sideBar-background')
    schemeEmitter.fire({ dark: false })
    expect(themeService.resolvedTheme).toBe('light')
    expect(dom.document.body.getAttribute('theme-mode')).toBe('light')

    const updateService = disposables.add(
      new UpdateWorkbenchService(mainProcess, createNoopLogService(), notifications, localization),
    )
    await updateService.initialize()
    updateEmitter.fire({ state: 'checking' })
    expect(updateService.state.state).toBe('checking')
    await updateService.checkForUpdates()
    await updateService.installUpdate()

    const rendererLog = disposables.add(new RendererLogService(mainProcess, nativeHost))
    rendererLog.setLevel('debug')
    rendererLog.error('UI', 'oops', new Error('err'))
    rendererLog.warn('UI', 'warn', { a: 1 })
    rendererLog.info('UI', 'info')
    rendererLog.debug('UI', 'debug')
    rendererLog.verbose('UI', 'verbose')
    expect((await rendererLog.getLogsSummary()).fileCount).toBe(1)
    await rendererLog.clearLogs()
    await rendererLog.openLogsDirectory()
    expect(logChannelCalls).toContain('writeRenderer')

    const lifecycle = disposables.add(new WorkbenchLifecycleService())
    const readyPromise = lifecycle.when(WorkbenchPhase.AfterRestored)
    lifecycle.setPhase(WorkbenchPhase.AfterRestored)
    await readyPromise
    expect(() => lifecycle.setPhase(WorkbenchPhase.BlockStartup)).toThrow('backwards')

    const di = disposables.add(new TestInstantiationService())
    const cmdService = disposables.add(new CommandService(di, createNoopLogService()))
    const cmdReg = disposables.add(
      CommandsRegistry.registerCommand('test.wb.cmd', (_acc, value) => `ok:${String(value)}`),
    )
    expect(await cmdService.executeCommand('test.wb.cmd', 7)).toBe('ok:7')
    await expect(cmdService.executeCommand('test.wb.missing')).rejects.toThrow('not found')
    cmdReg.dispose()

    const dialogService = disposables.add(new DialogService())
    const confirmPromise = dialogService.confirm({
      title: 'Sure?',
      confirmLabel: 'Yes',
      cancelLabel: 'No',
    })
    const yesButton = dom.document.body.querySelectorAll('.monaco-text-button')[1] as FakeElement
    dom.dispatch(yesButton, 'click')
    expect(await confirmPromise).toBe(true)

    const contextMenuService = disposables.add(new ContextMenuService())
    const menuHandle = contextMenuService.showContextMenu({ x: 10, y: 10 }, [
      { id: 'x', label: 'X', run: () => undefined },
    ])
    expect(dom.document.body.querySelector('.monaco-menu')).not.toBeNull()
    menuHandle.dispose()
  })
})
