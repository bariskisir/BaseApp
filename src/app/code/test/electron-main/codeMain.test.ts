import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import { CodeMain } from '@app/code/electron-main/main'
import { afterEach, describe, expect, it, vi } from 'vitest'

const electronHarness = vi.hoisted(() => {
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
    emit(event: string, ...args: unknown[]): void {
      for (const listener of [...(this.listeners.get(event) ?? [])]) {
        listener(...args)
      }
    }
    clear(): void {
      this.listeners.clear()
    }
  }

  class HoistedBrowserWindow extends MiniEmitter {
    static instances: HoistedBrowserWindow[] = []
    readonly webContents = Object.assign(new MiniEmitter(), {
      session: {
        setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn(),
      },
      setWindowOpenHandler: vi.fn(),
      setZoomLevel: vi.fn(),
      executeJavaScript: vi.fn(async () => 1),
    })
    private destroyed = false
    constructor() {
      super()
      HoistedBrowserWindow.instances.push(this)
    }
    static getAllWindows(): HoistedBrowserWindow[] {
      return HoistedBrowserWindow.instances
    }
    isDestroyed(): boolean {
      return this.destroyed
    }
    isVisible(): boolean {
      return true
    }
    isMinimized(): boolean {
      return false
    }
    isMaximized(): boolean {
      return false
    }
    isFullScreen(): boolean {
      return false
    }
    show(): void {}
    hide(): void {}
    focus(): void {}
    restore(): void {}
    maximize(): void {}
    unmaximize(): void {}
    setFullScreen(): void {}
    getBounds() {
      return { x: 0, y: 0, width: 1180, height: 760 }
    }
    getNormalBounds() {
      return { x: 0, y: 0, width: 1180, height: 760 }
    }
    setBounds(): void {}
    setSize(): void {}
    center(): void {}
    setAlwaysOnTop(): void {}
    setContentProtection(): void {}
    setOpacity(): void {}
    setSkipTaskbar(): void {}
    setTitleBarOverlay(): void {}
    async loadURL(): Promise<void> {}
    async loadFile(): Promise<void> {}
  }

  class HoistedTray extends MiniEmitter {
    setToolTip(): void {}
    setContextMenu(): void {}
    destroy(): void {}
  }

  const appEmitter = new MiniEmitter()
  const state = {
    singleInstanceLock: true,
    whenReadyError: null as Error | null,
    quitCalls: 0,
    appUserModelId: '',
    app: Object.assign(appEmitter, {
      name: 'BaseApp',
      isPackaged: false,
      requestSingleInstanceLock: () => state.singleInstanceLock,
      whenReady: async () => {
        if (state.whenReadyError) {
          throw state.whenReadyError
        }
      },
      quit: () => {
        state.quitCalls += 1
      },
      setAppUserModelId: (id: string) => {
        state.appUserModelId = id
      },
      setLoginItemSettings: vi.fn(),
      getVersion: () => '2.0.0',
      getAppPath: () => '/app',
      getPath: (name: string) => (name === 'temp' ? tmpdir() : '/tmp'),
      setPath: vi.fn(),
      relaunch: vi.fn(),
      exit: vi.fn(),
    }),
    nativeTheme: Object.assign(new MiniEmitter(), {
      shouldUseDarkColors: true,
      themeSource: 'system',
    }),
    BrowserWindow: HoistedBrowserWindow,
    Tray: HoistedTray,
    reset() {
      state.singleInstanceLock = true
      state.whenReadyError = null
      state.quitCalls = 0
      state.appUserModelId = ''
      HoistedBrowserWindow.instances = []
      appEmitter.clear()
      state.nativeTheme.clear()
    },
  }
  return state
})

vi.mock('electron', () => ({
  app: electronHarness.app,
  BrowserWindow: electronHarness.BrowserWindow,
  nativeTheme: electronHarness.nativeTheme,
  Tray: electronHarness.Tray,
  Menu: { buildFromTemplate: (t: unknown) => t },
  nativeImage: {
    createFromPath: () => ({ isEmpty: () => false, resize: () => ({}) }),
  },
  screen: {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
    getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }],
  },
  ipcMain: {
    on: vi.fn(),
    once: vi.fn(),
    handle: vi.fn(),
    removeHandler: vi.fn(),
    removeListener: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(async () => undefined),
    openPath: vi.fn(async () => ''),
  },
  dialog: {
    showSaveDialog: vi.fn(async () => ({ canceled: true })),
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
  },
}))

describe('CodeMain bootstrap', () => {
  const tempDirs: string[] = []

  function createTempPaths() {
    const root = mkdtempSync(join(tmpdir(), 'baseapp-codemain-'))
    tempDirs.push(root)
    return {
      applicationDataRoot: root,
      dataDirectory: join(root, 'data'),
      logsDirectory: join(root, 'logs'),
      runtimeDirectory: join(root, 'runtime'),
      sessionDirectory: join(root, 'session'),
    }
  }

  afterEach(() => {
    electronHarness.reset()
    vi.restoreAllMocks()
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 })
    }
  })

  ensureNoDisposablesAreLeakedInTestSuite()

  it('exits immediately when single-instance lock is unavailable', async () => {
    electronHarness.singleInstanceLock = false
    const codeMain = new CodeMain(createTempPaths())
    await codeMain.main()
    expect(electronHarness.quitCalls).toBe(1)
    ;(codeMain as unknown as { disposables: { dispose(): void } }).disposables.dispose()
  })

  it('bootstraps all main-process services, creates window, and disposes cleanly on shutdown', async () => {
    const codeMain = new CodeMain(createTempPaths())
    await codeMain.main()
    expect(electronHarness.BrowserWindow.instances).toHaveLength(1)

    electronHarness.app.emit('will-quit', { preventDefault: () => undefined })
    await new Promise((resolve) => setTimeout(resolve, 40))
  })

  it('handles fatal startup errors cleanly and quits the application', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    electronHarness.whenReadyError = new Error('ready failed')
    const codeMain = new CodeMain(createTempPaths())
    await codeMain.main()
    expect(electronHarness.quitCalls).toBe(1)
    expect(consoleSpy).toHaveBeenCalled()
  })
})
