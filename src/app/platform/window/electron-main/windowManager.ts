import { RunOnceScheduler } from '@app/base/common/async'
import { Emitter, type Event } from '@app/base/common/event'
import {
  Disposable,
  DisposableStore,
  MutableDisposable,
  toDisposable,
} from '@app/base/common/lifecycle'
import type {
  AppConfiguration,
  ResolvedThemeMode,
  ThemeMode,
} from '@app/platform/configuration/common/configuration'
import { IEnvironmentMainService } from '@app/platform/environment/electron-main/environmentMainService'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'
import { ILogService } from '@app/platform/log/common/log'
import { IProductService } from '@app/platform/product/common/productService'
import { IExternalUrlPolicy } from '@app/platform/security/common/externalUrlPolicy'
import { IStateService } from '@app/platform/state/common/state'
import { IThemeMainService } from '@app/platform/theme/electron-main/themeMainService'
import { BrowserWindow, type BrowserWindowConstructorOptions, screen } from 'electron'
import {
  DEFAULT_AUXILIARY_BAR_STATE,
  DEFAULT_SIDEBAR_STATE,
  DEFAULT_TERTIARY_BAR_STATE,
  DEFAULT_WINDOW_SIZE,
  type PersistedWindowState,
  type SidebarState,
  type WindowBounds,
} from '../common/window'
import { isAllowedRendererNavigation } from './rendererNavigationPolicy'
import { resolveTitleBarOverlayOptions } from './titleBarOverlay'
import { focusBrowserWindow } from './windowFocus'
import { fitWindowBoundsToDisplays, parsePersistedWindowState } from './windowState'

export interface IWindowManager {
  readonly _serviceBrand: undefined
  createWindow(startMinimized: boolean, initialTheme: ThemeMode): Promise<BrowserWindow>
  getMainWindow(): BrowserWindow | null
  focusMainWindow(): void
  applyConfiguration(config: AppConfiguration): void
  getSidebarState(): SidebarState | null
  setSidebarState(state: SidebarState): void
  getActiveSessionId(): string | null
  setActiveSessionId(id: string): void
  resetLayout(): SidebarState
  setTitleBarTheme(theme: ResolvedThemeMode): void
  requestOpenSettings(): void
  readonly onDidChangeMaximized: Event<boolean>
  readonly onDidChangeFullScreen: Event<boolean>
  readonly onDidRequestOpenSettings: Event<void>
}

export const IWindowManager = createDecorator<IWindowManager>('windowManager')

export const WINDOW_STATE_STORAGE_KEY = 'window.state'

const SAVE_DEBOUNCE_MS = 250
const RENDERER_MOUNT_CHECK_DELAY_MS = 1_000
const REVEAL_WINDOW_FALLBACK_MS = 250

export class WindowManager extends Disposable implements IWindowManager {
  declare readonly _serviceBrand: undefined

  private readonly _onDidChangeMaximized = this._register(new Emitter<boolean>())
  readonly onDidChangeMaximized: Event<boolean> = this._onDidChangeMaximized.event

  private readonly _onDidChangeFullScreen = this._register(new Emitter<boolean>())
  readonly onDidChangeFullScreen: Event<boolean> = this._onDidChangeFullScreen.event

  private readonly _onDidRequestOpenSettings = this._register(new Emitter<void>())
  readonly onDidRequestOpenSettings: Event<void> = this._onDidRequestOpenSettings.event

  private readonly windowDisposables = this._register(new MutableDisposable<DisposableStore>())
  private readonly saveScheduler: RunOnceScheduler
  private mainWindow: BrowserWindow | null = null
  private windowState: PersistedWindowState | null = null

  constructor(
    @IStateService private readonly stateService: IStateService,
    @IEnvironmentMainService private readonly environmentService: IEnvironmentMainService,
    @IThemeMainService private readonly themeMainService: IThemeMainService,
    @ILogService private readonly logService: ILogService,
    @IProductService private readonly productService: IProductService,
    @IExternalUrlPolicy private readonly externalUrlPolicy: IExternalUrlPolicy,
  ) {
    super()
    this.saveScheduler = this._register(
      new RunOnceScheduler(() => {
        this.captureWindowState()
        this.persistState(false)
      }, SAVE_DEBOUNCE_MS),
    )
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : null
  }

  focusMainWindow(): void {
    focusBrowserWindow(this.getMainWindow())
  }

  getSidebarState(): SidebarState | null {
    const state = this.windowState ?? this.readPersistedState()
    const sidebar = state?.sidebar
    if (!sidebar) {
      return null
    }
    return {
      open: sidebar.open,
      width: sidebar.width,
      compact: state.compactMode ?? false,
      auxiliaryOpen: state.auxiliaryBar?.open ?? DEFAULT_AUXILIARY_BAR_STATE.open,
      auxiliaryWidth: state.auxiliaryBar?.width ?? DEFAULT_AUXILIARY_BAR_STATE.width,
      tertiaryOpen: state.tertiaryBar?.open ?? DEFAULT_TERTIARY_BAR_STATE.open,
      tertiaryHeight: state.tertiaryBar?.height ?? DEFAULT_TERTIARY_BAR_STATE.height,
      viewLocations: state.viewLocations ? { ...state.viewLocations } : undefined,
      activePrimaryViewId: state.activePrimaryViewId,
      activeAuxiliaryViewId: state.activeAuxiliaryViewId,
      activeTertiaryViewId: state.activeTertiaryViewId,
    }
  }

  setSidebarState(state: SidebarState): void {
    if (!this.windowState) {
      return
    }
    this.windowState = {
      ...this.windowState,
      sidebar: { open: state.open, width: state.width },
      auxiliaryBar: {
        open: state.auxiliaryOpen ?? this.windowState.auxiliaryBar?.open ?? false,
        width:
          state.auxiliaryWidth ??
          this.windowState.auxiliaryBar?.width ??
          DEFAULT_AUXILIARY_BAR_STATE.width,
      },
      tertiaryBar: {
        open: state.tertiaryOpen ?? this.windowState.tertiaryBar?.open ?? false,
        height:
          state.tertiaryHeight ??
          this.windowState.tertiaryBar?.height ??
          DEFAULT_TERTIARY_BAR_STATE.height,
      },
      compactMode: state.compact,
      viewLocations:
        state.viewLocations !== undefined
          ? { ...state.viewLocations }
          : this.windowState.viewLocations,
      activePrimaryViewId:
        state.activePrimaryViewId !== undefined
          ? state.activePrimaryViewId
          : this.windowState.activePrimaryViewId,
      activeAuxiliaryViewId:
        state.activeAuxiliaryViewId !== undefined
          ? state.activeAuxiliaryViewId
          : this.windowState.activeAuxiliaryViewId,
      activeTertiaryViewId:
        state.activeTertiaryViewId !== undefined
          ? state.activeTertiaryViewId
          : this.windowState.activeTertiaryViewId,
    }
    this.scheduleSave()
  }

  getActiveSessionId(): string | null {
    const state = this.windowState ?? this.readPersistedState()
    return state?.activeSessionId ?? null
  }

  setActiveSessionId(id: string): void {
    if (!this.windowState || this.windowState.activeSessionId === id) {
      return
    }
    this.windowState = {
      ...this.windowState,
      activeSessionId: id,
    }
    this.scheduleSave()
  }

  resetLayout(): SidebarState {
    const window = this.getMainWindow()
    if (window) {
      if (window.isFullScreen()) {
        window.setFullScreen(false)
      }
      if (window.isMaximized()) {
        window.unmaximize()
      }
      const workArea =
        screen.getPrimaryDisplay?.().workArea ?? screen.getAllDisplays()[0]?.workArea ?? null
      const width = workArea
        ? Math.min(DEFAULT_WINDOW_SIZE.width, workArea.width)
        : DEFAULT_WINDOW_SIZE.width
      const height = workArea
        ? Math.min(DEFAULT_WINDOW_SIZE.height, workArea.height)
        : DEFAULT_WINDOW_SIZE.height

      let bounds: WindowBounds
      if (workArea) {
        bounds = {
          x: Math.round(workArea.x + (workArea.width - width) / 2),
          y: Math.round(workArea.y + (workArea.height - height) / 2),
          width,
          height,
        }
        window.setBounds(bounds)
      } else {
        window.setSize(width, height)
        window.center()
        bounds = window.getBounds()
      }

      this.saveScheduler.cancel()
      this.windowState = {
        revision: 1,
        bounds,
        maximized: false,
        fullScreen: false,
        sidebar: { open: DEFAULT_SIDEBAR_STATE.open, width: DEFAULT_SIDEBAR_STATE.width },
        auxiliaryBar: { ...DEFAULT_AUXILIARY_BAR_STATE },
        tertiaryBar: { ...DEFAULT_TERTIARY_BAR_STATE },
        compactMode: DEFAULT_SIDEBAR_STATE.compact,
        activeSessionId: this.windowState?.activeSessionId,
      }
      this.persistState(true)
    }
    return { ...DEFAULT_SIDEBAR_STATE }
  }

  applyConfiguration(config: AppConfiguration): void {
    this.themeMainService.setThemeSource(config.theme)
    const window = this.getMainWindow()
    if (!window) {
      return
    }
    window.setAlwaysOnTop(config.alwaysOnTop)
    window.setContentProtection(config.contentProtection)
    window.setOpacity(config.windowOpacity)
    window.setSkipTaskbar(!config.showTaskbar)
    window.webContents.setZoomLevel(config.zoomLevel)
  }

  setTitleBarTheme(theme: ResolvedThemeMode): void {
    if (this.environmentService.platform !== 'darwin') {
      return
    }
    const window = this.getMainWindow()
    if (!window) {
      return
    }
    window.setTitleBarOverlay(resolveTitleBarOverlayOptions(theme))
  }

  requestOpenSettings(): void {
    this.focusMainWindow()
    this._onDidRequestOpenSettings.fire()
  }

  async createWindow(startMinimized: boolean, initialTheme: ThemeMode): Promise<BrowserWindow> {
    const persisted = this.readPersistedState()
    const workAreas = screen.getAllDisplays().map((display) => display.workArea)
    const restoredBounds = persisted ? fitWindowBoundsToDisplays(persisted.bounds, workAreas) : null
    const resolvedTheme = this.resolveInitialTheme(initialTheme)
    const backgroundColor = this.themeMainService.getInitialBackgroundColor(initialTheme)

    const window = new BrowserWindow(
      this.buildWindowOptions(restoredBounds, resolvedTheme, backgroundColor),
    )
    this.mainWindow = window

    const disposables = new DisposableStore()
    this.windowDisposables.value = disposables

    this.windowState = {
      revision: 1,
      bounds: restoredBounds ?? window.getBounds(),
      maximized: persisted?.maximized ?? false,
      fullScreen: persisted?.fullScreen ?? false,
      sidebar: persisted?.sidebar,
      auxiliaryBar: persisted?.auxiliaryBar,
      tertiaryBar: persisted?.tertiaryBar,
      compactMode: persisted?.compactMode,
      activeSessionId: persisted?.activeSessionId,
      viewLocations: persisted?.viewLocations,
      activePrimaryViewId: persisted?.activePrimaryViewId,
      activeAuxiliaryViewId: persisted?.activeAuxiliaryViewId,
      activeTertiaryViewId: persisted?.activeTertiaryViewId,
    }

    let revealed = false
    let revealTimer: ReturnType<typeof setTimeout> | null = null
    let mountCheckTimer: ReturnType<typeof setTimeout> | null = null

    const clearRevealTimer = (): void => {
      if (revealTimer) {
        clearTimeout(revealTimer)
        revealTimer = null
      }
    }
    const clearMountCheckTimer = (): void => {
      if (mountCheckTimer) {
        clearTimeout(mountCheckTimer)
        mountCheckTimer = null
      }
    }
    disposables.add(toDisposable(clearRevealTimer))
    disposables.add(toDisposable(clearMountCheckTimer))

    const revealWindow = (): void => {
      if (revealed || window.isDestroyed()) {
        return
      }
      revealed = true
      clearRevealTimer()
      if (startMinimized) {
        window.hide()
      } else if (!window.isVisible()) {
        window.show()
      }
    }

    this.trackWindowEvents(window)
    this.configureRendererDiagnostics(window, () => {
      clearMountCheckTimer()
      mountCheckTimer = setTimeout(() => {
        mountCheckTimer = null
        void this.verifyRendererMounted(window)
      }, RENDERER_MOUNT_CHECK_DELAY_MS)
    })
    this.configureSecurity(window)

    window.once('ready-to-show', () => {
      if (persisted?.fullScreen) {
        window.setFullScreen(true)
      } else if (persisted?.maximized) {
        window.maximize()
      }
      revealWindow()
    })

    window.webContents.on('did-finish-load', () => {
      if (revealed) {
        return
      }
      clearRevealTimer()
      revealTimer = setTimeout(revealWindow, REVEAL_WINDOW_FALLBACK_MS)
    })

    window.once('closed', () => {
      this.saveScheduler.cancel()
      disposables.dispose()
      if (this.mainWindow === window) {
        this.mainWindow = null
      }
    })

    await this.loadRenderer(window)
    return window
  }

  private resolveInitialTheme(theme: ThemeMode): ResolvedThemeMode {
    if (theme !== 'system') {
      return theme
    }
    return this.themeMainService.getColorScheme().dark ? 'dark' : 'light'
  }

  private buildWindowOptions(
    bounds: WindowBounds | null,
    theme: ResolvedThemeMode,
    backgroundColor: string,
  ): BrowserWindowConstructorOptions {
    return {
      ...(bounds ?? DEFAULT_WINDOW_SIZE),
      minWidth: 450,
      minHeight: 300,
      show: false,
      backgroundColor,
      title: this.productService.name,
      ...(this.environmentService.platform === 'darwin'
        ? {
            titleBarStyle: 'hidden' as const,
            titleBarOverlay: resolveTitleBarOverlayOptions(theme),
          }
        : { frame: false }),
      webPreferences: {
        preload: this.environmentService.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        devTools: !this.environmentService.isPackaged,
        partition: `${this.productService.name}-session`,
      },
    }
  }

  private trackWindowEvents(window: BrowserWindow): void {
    window.on('move', () => this.scheduleSave())
    window.on('resize', () => this.scheduleSave())
    window.on('maximize', () => {
      this.scheduleSave()
      this._onDidChangeMaximized.fire(true)
    })
    window.on('unmaximize', () => {
      this.scheduleSave()
      this._onDidChangeMaximized.fire(false)
    })
    window.on('enter-full-screen', () => {
      this.scheduleSave()
      this._onDidChangeFullScreen.fire(true)
    })
    window.on('leave-full-screen', () => {
      this.scheduleSave()
      this._onDidChangeFullScreen.fire(false)
    })
    window.on('close', () => {
      this.saveScheduler.cancel()
      this.captureWindowState()
      this.persistState(true)
    })
  }

  private configureRendererDiagnostics(
    window: BrowserWindow,
    scheduleMountCheck: () => void,
  ): void {
    window.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
        if (!isMainFrame) {
          return
        }
        this.logService.error('WindowManager', 'Renderer document failed to load.', {
          errorCode,
          errorDescription,
          validatedUrl,
        })
      },
    )
    window.webContents.on('preload-error', (_event, preloadPath, error) => {
      this.logService.error('WindowManager', 'Renderer preload failed.', { preloadPath, error })
    })
    window.webContents.on('render-process-gone', (_event, details) => {
      this.logService.error('WindowManager', 'Renderer process exited unexpectedly.', details)
    })
    window.webContents.on('console-message', (details) => {
      if (details.level !== 'error') {
        return
      }
      this.logService.error('RendererConsole', details.message, {
        source: details.sourceId,
        line: details.lineNumber,
      })
    })
    window.webContents.on('did-finish-load', scheduleMountCheck)
  }

  private async verifyRendererMounted(window: BrowserWindow): Promise<void> {
    if (window.isDestroyed()) {
      return
    }
    try {
      const childCount = await window.webContents.executeJavaScript(
        "document.getElementById('root')?.childElementCount ?? 0",
        true,
      )
      if (childCount === 0) {
        this.logService.error(
          'WindowManager',
          'Renderer finished loading without mounting the application.',
        )
      }
    } catch (error) {
      this.logService.error('WindowManager', 'Renderer health check failed.', error)
    }
  }

  private async loadRenderer(window: BrowserWindow): Promise<void> {
    if (this.environmentService.devServerUrl) {
      await window.loadURL(this.environmentService.devServerUrl)
    } else {
      await window.loadFile(this.environmentService.rendererHtmlPath)
    }
  }

  private configureSecurity(window: BrowserWindow): void {
    window.webContents.setWindowOpenHandler((details) => {
      if (!this.externalUrlPolicy.isAllowed(details.url)) {
        this.logService.warn('WindowManager', 'Blocked untrusted window open request.', details.url)
      }
      return { action: 'deny' }
    })
    window.webContents.on('will-attach-webview', (event) => {
      event.preventDefault()
    })
    window.webContents.on('will-navigate', (event, url) => {
      if (
        !isAllowedRendererNavigation(url, {
          packagedRendererPath: this.environmentService.rendererHtmlPath,
          devServerUrl: this.environmentService.devServerUrl,
          platform: this.environmentService.platform,
        })
      ) {
        event.preventDefault()
      }
    })
    const appSession = window.webContents.session
    appSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    appSession.setPermissionCheckHandler(() => false)
  }

  private readPersistedState(): PersistedWindowState | null {
    return parsePersistedWindowState(this.stateService.getItem<unknown>(WINDOW_STATE_STORAGE_KEY))
  }

  private scheduleSave(): void {
    this.captureWindowState()
    this.saveScheduler.schedule()
  }

  private captureWindowState(): void {
    const window = this.getMainWindow()
    if (!window) {
      return
    }
    const maximized = window.isMaximized()
    const fullScreen = window.isFullScreen()
    const bounds =
      maximized || fullScreen
        ? (this.windowState?.bounds ?? window.getNormalBounds())
        : window.getBounds()
    this.windowState = {
      revision: 1,
      bounds,
      maximized,
      fullScreen,
      sidebar: this.windowState?.sidebar,
      auxiliaryBar: this.windowState?.auxiliaryBar,
      tertiaryBar: this.windowState?.tertiaryBar,
      compactMode: this.windowState?.compactMode,
      activeSessionId: this.windowState?.activeSessionId,
      viewLocations: this.windowState?.viewLocations,
      activePrimaryViewId: this.windowState?.activePrimaryViewId,
      activeAuxiliaryViewId: this.windowState?.activeAuxiliaryViewId,
      activeTertiaryViewId: this.windowState?.activeTertiaryViewId,
    }
  }

  private persistState(flushSync: boolean): void {
    if (!this.windowState) {
      return
    }
    try {
      this.stateService.setItem(WINDOW_STATE_STORAGE_KEY, this.windowState)
      if (flushSync) {
        this.stateService.flush()
      }
    } catch (error) {
      this.logService.warn('WindowManager', 'Window state could not be persisted.', error)
    }
  }
}
