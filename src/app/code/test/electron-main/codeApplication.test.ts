import { EventEmitter } from 'node:events'
import { Emitter } from '@app/base/common/event'
import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import { CodeApplication } from '@app/code/electron-main/app'
import {
  DEFAULT_CONFIGURATION,
  type IConfigurationChangeEvent,
  type IConfigurationService,
} from '@app/platform/configuration/common/configuration'
import type { IEnvironmentMainService } from '@app/platform/environment/electron-main/environmentMainService'
import {
  type ILifecycleMainService,
  LifecycleMainPhase,
  type WillShutdownEvent,
} from '@app/platform/lifecycle/common/lifecycle'
import type { ILoggerMainService } from '@app/platform/log/common/log'
import type { INativeHostService } from '@app/platform/native/common/native'
import { ProductService } from '@app/platform/product/common/productService'
import type { ISessionsService } from '@app/platform/sessions/common/sessions'
import type { ITelemetryService } from '@app/platform/telemetry/common/telemetry'
import type { IColorScheme } from '@app/platform/theme/common/theme'
import type { IThemeMainService } from '@app/platform/theme/electron-main/themeMainService'
import type { ITrayMainService } from '@app/platform/tray/common/tray'
import type { IUpdateService, UpdateStateEvent } from '@app/platform/update/common/update'
import type { IWindowManager } from '@app/platform/window/electron-main/windowManager'
import { describe, expect, it, vi } from 'vitest'

const electronState = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void
  const listeners = new Map<string, Set<Listener>>()
  const mockApp = {
    setLoginItemSettings: vi.fn(),
    on(event: string, listener: Listener) {
      let set = listeners.get(event)
      if (!set) {
        set = new Set()
        listeners.set(event, set)
      }
      set.add(listener)
      return this
    },
    removeListener(event: string, listener: Listener) {
      listeners.get(event)?.delete(listener)
      return this
    },
    emit(event: string, ...args: unknown[]) {
      for (const listener of [...(listeners.get(event) ?? [])]) {
        listener(...args)
      }
    },
  }
  return {
    mockApp,
    openWindows: [] as unknown[],
  }
})

const mockApp = electronState.mockApp

vi.mock('electron', () => ({
  app: electronState.mockApp,
  BrowserWindow: {
    getAllWindows: () => electronState.openWindows,
  },
  ipcMain: {
    on: vi.fn(),
    once: vi.fn(),
    handle: vi.fn(),
    removeHandler: vi.fn(),
    removeListener: vi.fn(),
  },
}))

describe('CodeApplication', () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite()

  it('starts up, registers IPC channels, responds to app/config/tray events, and shuts down cleanly', async () => {
    const configEmitter = disposables.add(new Emitter<IConfigurationChangeEvent>())
    const beforeShutdown = disposables.add(new Emitter<void>())
    const willShutdown = disposables.add(new Emitter<WillShutdownEvent>())
    const colorSchemeEmitter = disposables.add(new Emitter<IColorScheme>())
    const updateStateEmitter = disposables.add(new Emitter<UpdateStateEvent>())
    const maxEmitter = disposables.add(new Emitter<boolean>())
    const fsEmitter = disposables.add(new Emitter<boolean>())
    const settingsEmitter = disposables.add(new Emitter<void>())

    const fakeWindow = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      hide: vi.fn(),
    })
    electronState.openWindows = [fakeWindow]

    const phases: LifecycleMainPhase[] = []
    const lifecycleService: ILifecycleMainService = {
      _serviceBrand: undefined,
      phase: LifecycleMainPhase.Starting,
      isQuitting: false,
      onBeforeShutdown: beforeShutdown.event,
      onWillShutdown: willShutdown.event,
      setPhase: (phase) => {
        phases.push(phase)
      },
      when: async () => undefined,
      markQuitting: vi.fn(),
      quit: vi.fn(),
      relaunch: vi.fn(),
    }

    const configService: IConfigurationService = {
      _serviceBrand: undefined,
      onDidChangeConfiguration: configEmitter.event,
      getConfiguration: () => ({ ...DEFAULT_CONFIGURATION, autoUpdate: true }),
      getValue: (key) => DEFAULT_CONFIGURATION[key],
      updateConfiguration: async () => DEFAULT_CONFIGURATION,
      resetConfiguration: async () => DEFAULT_CONFIGURATION,
      importConfiguration: async () => DEFAULT_CONFIGURATION,
    }

    const loggerService = {
      setLevel: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
      writeRenderer: vi.fn(),
      getLogsSummary: vi.fn(async () => ({ fileCount: 0, totalBytes: 0 })),
      clearLogs: vi.fn(async () => ({ fileCount: 0, totalBytes: 0 })),
    } as unknown as ILoggerMainService

    const windowManager = {
      createWindow: vi.fn(async () => fakeWindow),
      focusMainWindow: vi.fn(),
      applyConfiguration: vi.fn(),
      setTitleBarTheme: vi.fn(),
    } as unknown as IWindowManager

    const trayService = {
      applyConfiguration: vi.fn(),
      shouldMinimizeOnClose: vi.fn(() => true),
      prepareToQuit: vi.fn(),
    } as unknown as ITrayMainService

    const updateService = {
      onDidChangeState: updateStateEmitter.event,
      getState: async () => ({ state: 'idle' as const }),
      checkForUpdates: vi.fn(async () => undefined),
      quitAndInstall: vi.fn(async () => undefined),
      applyConfiguration: vi.fn(),
    } as unknown as IUpdateService

    const telemetryService = {
      sendStartupEvent: vi.fn(async () => undefined),
    } as unknown as ITelemetryService

    const themeMainService = {
      onDidChangeColorScheme: colorSchemeEmitter.event,
      getColorScheme: () => ({ dark: true }),
      setThemeSource: vi.fn(),
      getInitialBackgroundColor: () => '#1f1f1f',
    } as unknown as IThemeMainService

    const nativeHostService = {
      onDidChangeWindowMaximized: maxEmitter.event,
      onDidChangeWindowFullScreen: fsEmitter.event,
      onDidRequestOpenSettings: settingsEmitter.event,
    } as unknown as INativeHostService

    const envService = {
      platform: 'win32' as const,
      isPackaged: true,
    } as unknown as IEnvironmentMainService

    const appInstance = disposables.add(
      new CodeApplication(
        new ProductService('2.0.0'),
        envService,
        lifecycleService,
        configService,
        loggerService,
        {} as ISessionsService,
        themeMainService,
        windowManager,
        trayService,
        updateService,
        telemetryService,
        nativeHostService,
      ),
    )

    await appInstance.startup()
    expect(phases).toEqual([
      LifecycleMainPhase.Ready,
      LifecycleMainPhase.AfterWindowOpen,
      LifecycleMainPhase.Eventually,
    ])
    expect(mockApp.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false })
    expect(telemetryService.sendStartupEvent).toHaveBeenCalledOnce()
    expect(updateService.checkForUpdates).toHaveBeenCalledOnce()

    let prevented = false
    fakeWindow.emit('close', {
      preventDefault() {
        prevented = true
      },
    })
    expect(prevented).toBe(true)
    expect(fakeWindow.hide).toHaveBeenCalledOnce()

    mockApp.emit('second-instance')
    mockApp.emit('activate')
    expect(windowManager.focusMainWindow).toHaveBeenCalledTimes(2)

    electronState.openWindows = []
    mockApp.emit('activate')
    expect(windowManager.createWindow).toHaveBeenCalledTimes(2)

    configEmitter.fire({
      configuration: { ...DEFAULT_CONFIGURATION, theme: 'light' },
      changedKeys: new Set(['theme']),
      affectsConfiguration: (k) => k === 'theme',
    })
    expect(themeMainService.setThemeSource).toHaveBeenCalledWith('light')

    mockApp.emit('window-all-closed')
    expect(lifecycleService.quit).toHaveBeenCalledOnce()

    mockApp.emit('before-quit')
    beforeShutdown.fire()
    willShutdown.fire({ join: () => undefined })
    expect(trayService.prepareToQuit).toHaveBeenCalled()
    expect(appInstance.isDisposed).toBe(true)
  })
})
