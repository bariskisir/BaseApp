import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import { DEFAULT_CONFIGURATION } from '@app/platform/configuration/common/configuration'
import type { IEnvironmentMainService } from '@app/platform/environment/electron-main/environmentMainService'
import type { ILogService } from '@app/platform/log/common/log'
import { ProductService } from '@app/platform/product/common/productService'
import { ExternalUrlPolicy } from '@app/platform/security/common/externalUrlPolicy'
import type { IStateService } from '@app/platform/state/common/state'
import type { IThemeMainService } from '@app/platform/theme/electron-main/themeMainService'
import {
  DEFAULT_AUXILIARY_BAR_STATE,
  DEFAULT_SIDEBAR_STATE,
  DEFAULT_TERTIARY_BAR_STATE,
} from '@app/platform/window/common/window'
import {
  WINDOW_STATE_STORAGE_KEY,
  WindowManager,
} from '@app/platform/window/electron-main/windowManager'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { FakeBrowserWindow } = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void

  class MiniEmitter {
    private readonly listeners = new Map<string, Set<Listener>>()

    on(event: string, listener: Listener): this {
      let set = this.listeners.get(event)
      if (!set) {
        set = new Set()
        this.listeners.set(event, set)
      }
      set.add(listener)
      return this
    }

    once(event: string, listener: Listener): this {
      const wrapped: Listener = (...args) => {
        this.removeListener(event, wrapped)
        listener(...args)
      }
      return this.on(event, wrapped)
    }

    removeListener(event: string, listener: Listener): this {
      this.listeners.get(event)?.delete(listener)
      return this
    }

    emit(event: string, ...args: unknown[]): boolean {
      const list = this.listeners.get(event)
      if (!list || list.size === 0) {
        return false
      }
      for (const listener of [...list]) {
        listener(...args)
      }
      return true
    }
  }

  class HoistedWebContents extends MiniEmitter {
    windowOpenHandler: ((details: { url: string }) => { action: string }) | null = null
    zoomLevel = 0
    permissionRequestHandler:
      ((wc: unknown, perm: string, cb: (allowed: boolean) => void) => void) | null = null
    permissionCheckHandler: (() => boolean) | null = null
    readonly session = {
      setPermissionRequestHandler: (
        fn: (wc: unknown, perm: string, cb: (allowed: boolean) => void) => void,
      ) => {
        this.permissionRequestHandler = fn
      },
      setPermissionCheckHandler: (fn: () => boolean) => {
        this.permissionCheckHandler = fn
      },
    }

    setWindowOpenHandler(fn: (details: { url: string }) => { action: string }): void {
      this.windowOpenHandler = fn
    }

    setZoomLevel(level: number): void {
      this.zoomLevel = level
    }

    async executeJavaScript(): Promise<number> {
      return 1
    }
  }

  class HoistedBrowserWindow extends MiniEmitter {
    static lastInstance: HoistedBrowserWindow | null = null
    readonly options: Record<string, unknown>
    readonly webContents = new HoistedWebContents()
    private destroyed = false
    private visible = false
    private maximized = false
    private fullScreen = false
    private bounds = { x: 100, y: 100, width: 1180, height: 760 }
    alwaysOnTop = false
    contentProtection = false
    opacity = 1
    skipTaskbar = false
    titleBarOverlay: unknown
    loadedTarget = ''

    constructor(options: Record<string, unknown>) {
      super()
      this.options = options
      HoistedBrowserWindow.lastInstance = this
    }

    isDestroyed(): boolean {
      return this.destroyed
    }
    isVisible(): boolean {
      return this.visible
    }
    isMinimized(): boolean {
      return false
    }
    isMaximized(): boolean {
      return this.maximized
    }
    isFullScreen(): boolean {
      return this.fullScreen
    }
    show(): void {
      this.visible = true
    }
    hide(): void {
      this.visible = false
    }
    focus(): void {}
    restore(): void {}
    minimize(): void {}
    close(): void {}
    maximize(): void {
      this.maximized = true
      this.emit('maximize')
    }
    unmaximize(): void {
      this.maximized = false
      this.emit('unmaximize')
    }
    setFullScreen(value: boolean): void {
      this.fullScreen = value
      this.emit(value ? 'enter-full-screen' : 'leave-full-screen')
    }
    getBounds() {
      return { ...this.bounds }
    }
    getNormalBounds() {
      return { ...this.bounds }
    }
    setBounds(next: { x: number; y: number; width: number; height: number }): void {
      this.bounds = { ...next }
    }
    setSize(width: number, height: number): void {
      this.bounds = { ...this.bounds, width, height }
    }
    center(): void {}
    setAlwaysOnTop(v: boolean): void {
      this.alwaysOnTop = v
    }
    setContentProtection(v: boolean): void {
      this.contentProtection = v
    }
    setOpacity(v: number): void {
      this.opacity = v
    }
    setSkipTaskbar(v: boolean): void {
      this.skipTaskbar = v
    }
    setTitleBarOverlay(opt: unknown): void {
      this.titleBarOverlay = opt
    }
    async loadURL(url: string): Promise<void> {
      this.loadedTarget = url
    }
    async loadFile(path: string): Promise<void> {
      this.loadedTarget = path
    }
    simulateClose(): void {
      this.emit('close')
      this.destroyed = true
      this.emit('closed')
    }
  }

  return { FakeBrowserWindow: HoistedBrowserWindow }
})

vi.mock('electron', () => ({
  BrowserWindow: FakeBrowserWindow,
  screen: {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
    getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }],
  },
}))

describe('WindowManager', () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite()

  beforeEach(() => {
    FakeBrowserWindow.lastInstance = null
  })

  it('creates window, restores/persists 3-sidebar state, applies zoom/config, and resets layout', async () => {
    const store = new Map<string, unknown>([
      [
        WINDOW_STATE_STORAGE_KEY,
        {
          revision: 1,
          bounds: { x: 40, y: 40, width: 1000, height: 700 },
          maximized: true,
          fullScreen: false,
          sidebar: { open: true, width: 220 },
          auxiliaryBar: { open: true, width: 210 },
          tertiaryBar: { open: true, height: 180 },
          compactMode: false,
          viewLocations: { 'workbench.view.sessions': 'tertiarybar' },
          activeTertiaryViewId: 'workbench.view.sessions',
        },
      ],
    ])
    const stateService: IStateService = {
      _serviceBrand: undefined,
      getItem: <T>(key: string, def?: T) => (store.has(key) ? (store.get(key) as T) : def) as T,
      setItem: (key, val) => {
        store.set(key, val)
      },
      removeItem: (key) => {
        store.delete(key)
      },
      flush: vi.fn(),
    }
    const envService = {
      platform: 'darwin',
      preloadPath: '/app/preload.js',
      rendererHtmlPath: '/app/index.html',
      devServerUrl: undefined,
      isPackaged: true,
    } as unknown as IEnvironmentMainService
    const themeMain = {
      getColorScheme: () => ({ dark: true }),
      setThemeSource: vi.fn(),
      getInitialBackgroundColor: () => '#1f1f1f',
    } as unknown as IThemeMainService
    const logService = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    } as unknown as ILogService
    const product = new ProductService('2.0.0')
    const urlPolicy = new ExternalUrlPolicy(product)

    const manager = disposables.add(
      new WindowManager(stateService, envService, themeMain, logService, product, urlPolicy),
    )

    const maxEvents: boolean[] = []
    const fsEvents: boolean[] = []
    let openSettingsRequests = 0
    disposables.add(manager.onDidChangeMaximized((v) => maxEvents.push(v)))
    disposables.add(manager.onDidChangeFullScreen((v) => fsEvents.push(v)))
    disposables.add(
      manager.onDidRequestOpenSettings(() => {
        openSettingsRequests += 1
      }),
    )

    await manager.createWindow(false, 'dark')
    const win = FakeBrowserWindow.lastInstance
    if (!win) {
      throw new Error('Expected BrowserWindow instance')
    }
    expect(win.loadedTarget).toBe('/app/index.html')

    win.emit('ready-to-show')
    expect(win.isVisible()).toBe(true)
    expect(win.isMaximized()).toBe(true)

    expect(manager.getSidebarState()).toEqual({
      open: true,
      width: 220,
      compact: false,
      auxiliaryOpen: true,
      auxiliaryWidth: 210,
      tertiaryOpen: true,
      tertiaryHeight: 180,
      viewLocations: { 'workbench.view.sessions': 'tertiarybar' },
      activePrimaryViewId: undefined,
      activeAuxiliaryViewId: undefined,
      activeTertiaryViewId: 'workbench.view.sessions',
    })

    manager.setSidebarState({
      open: true,
      width: 190,
      compact: false,
      auxiliaryOpen: false,
      auxiliaryWidth: 170,
      tertiaryOpen: true,
      tertiaryHeight: 150,
      activeTertiaryViewId: 'workbench.view.sessions',
    })
    manager.setActiveSessionId('11111111-1111-4111-8111-111111111111')
    expect(manager.getActiveSessionId()).toBe('11111111-1111-4111-8111-111111111111')

    manager.applyConfiguration({
      ...DEFAULT_CONFIGURATION,
      alwaysOnTop: true,
      zoomLevel: 2,
      windowOpacity: 0.8,
      showTaskbar: false,
    })
    expect(win.alwaysOnTop).toBe(true)
    expect(win.webContents.zoomLevel).toBe(2)
    expect(win.opacity).toBe(0.8)
    expect(win.skipTaskbar).toBe(true)

    manager.setTitleBarTheme('light')
    expect(win.titleBarOverlay).toEqual({ color: '#f8f8f8', symbolColor: '#1e1e1e', height: 35 })

    manager.requestOpenSettings()
    expect(openSettingsRequests).toBe(1)

    expect(win.webContents.windowOpenHandler?.({ url: 'https://evil.example' })).toEqual({
      action: 'deny',
    })
    expect(win.webContents.permissionCheckHandler?.()).toBe(false)
    let permAllowed = true
    win.webContents.permissionRequestHandler?.(null, 'media', (v) => {
      permAllowed = v
    })
    expect(permAllowed).toBe(false)

    win.setFullScreen(true)
    expect(fsEvents).toContain(true)

    manager.focusMainWindow()
    win.emit('resize')
    win.emit('move')
    win.emit('unmaximize')
    win.setFullScreen(false)
    expect(fsEvents).toContain(false)

    const navEvent = { preventDefault: vi.fn() }
    win.webContents.emit('will-navigate', navEvent, 'https://evil.example/phish')
    expect(navEvent.preventDefault).toHaveBeenCalledOnce()

    const reset = manager.resetLayout()
    expect(reset).toEqual(DEFAULT_SIDEBAR_STATE)
    expect(reset.width).toBe(170)
    expect(reset.auxiliaryWidth).toBe(DEFAULT_AUXILIARY_BAR_STATE.width)
    expect(reset.tertiaryHeight).toBe(DEFAULT_TERTIARY_BAR_STATE.height)
    expect(maxEvents).toContain(true)

    win.simulateClose()
    expect(manager.getMainWindow()).toBeNull()
  })
})
