import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Emitter } from '@app/base/common/event'
import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import {
  DEFAULT_CONFIGURATION,
  type IConfigurationService,
} from '@app/platform/configuration/common/configuration'
import type { IEnvironmentMainService } from '@app/platform/environment/electron-main/environmentMainService'
import type { ILifecycleMainService } from '@app/platform/lifecycle/common/lifecycle'
import type { ILoggerMainService } from '@app/platform/log/common/log'
import {
  NativeHostChannelClient,
  createNativeHostChannel,
} from '@app/platform/native/common/nativeIpc'
import { NativeHostMainService } from '@app/platform/native/electron-main/nativeHostMainService'
import { ProductService } from '@app/platform/product/common/productService'
import { ExternalUrlPolicy } from '@app/platform/security/common/externalUrlPolicy'
import type { ITrayMainService } from '@app/platform/tray/common/tray'
import { DEFAULT_SIDEBAR_STATE } from '@app/platform/window/common/window'
import type { IWindowManager } from '@app/platform/window/electron-main/windowManager'
import { afterEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => ({
  openExternal: vi.fn(async (_url: string) => undefined),
  openPath: vi.fn(async (_path: string) => ''),
  showSaveDialog: vi.fn(),
  showOpenDialog: vi.fn(),
}))

const openExternalMock = electronMocks.openExternal
const openPathMock = electronMocks.openPath
const showSaveDialogMock = electronMocks.showSaveDialog
const showOpenDialogMock = electronMocks.showOpenDialog

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir() },
  shell: {
    openExternal: (url: string) => electronMocks.openExternal(url),
    openPath: (targetPath: string) => electronMocks.openPath(targetPath),
  },
  dialog: {
    showSaveDialog: (...args: unknown[]) => electronMocks.showSaveDialog(...args),
    showOpenDialog: (...args: unknown[]) => electronMocks.showOpenDialog(...args),
  },
}))

describe('NativeHostMainService and NativeHost IPC channel', () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite()
  const tempDirs: string[] = []

  function createTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'baseapp-native-'))
    tempDirs.push(dir)
    return dir
  }

  afterEach(() => {
    openExternalMock.mockClear()
    openPathMock.mockReset()
    openPathMock.mockResolvedValue('')
    showSaveDialogMock.mockReset()
    showOpenDialogMock.mockReset()
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exposes runtime info, window controls, filesystem shortcuts, backup import/export, and relaunch', async () => {
    const onMax = disposables.add(new Emitter<boolean>())
    const onFs = disposables.add(new Emitter<boolean>())
    const onSettings = disposables.add(new Emitter<void>())

    let maximized = false
    let fullScreen = false
    let opacity = 1
    const fakeWindow = {
      setAlwaysOnTop: vi.fn(),
      setOpacity: vi.fn((v: number) => {
        opacity = v
      }),
      getOpacity: () => opacity,
      minimize: vi.fn(),
      isMaximized: () => maximized,
      maximize: vi.fn(() => {
        maximized = true
      }),
      unmaximize: vi.fn(() => {
        maximized = false
      }),
      isFullScreen: () => fullScreen,
      setFullScreen: vi.fn((v: boolean) => {
        fullScreen = v
      }),
      close: vi.fn(),
    }

    let sidebarState = { ...DEFAULT_SIDEBAR_STATE }
    let activeSessionId: string | null = null
    const windowManager = {
      onDidChangeMaximized: onMax.event,
      onDidChangeFullScreen: onFs.event,
      onDidRequestOpenSettings: onSettings.event,
      getMainWindow: () => fakeWindow,
      getSidebarState: () => sidebarState,
      setSidebarState: vi.fn((s) => {
        sidebarState = s
      }),
      getActiveSessionId: () => activeSessionId,
      setActiveSessionId: vi.fn((id) => {
        activeSessionId = id
      }),
      resetLayout: () => ({ ...DEFAULT_SIDEBAR_STATE }),
    } as unknown as IWindowManager

    const configService = {
      getConfiguration: () => ({ ...DEFAULT_CONFIGURATION, theme: 'dark' as const }),
      importConfiguration: vi.fn(async () => ({
        ...DEFAULT_CONFIGURATION,
        uiLanguage: 'tr' as const,
      })),
    } as unknown as IConfigurationService

    const dir = createTempDir()
    const envService = {
      platform: 'win32' as const,
      dataDirectory: dir,
    } as unknown as IEnvironmentMainService
    const loggerService = {
      getLogsDirectory: () => join(dir, 'logs'),
    } as unknown as ILoggerMainService
    const lifecycleService = { relaunch: vi.fn() } as unknown as ILifecycleMainService
    const trayService = { prepareToQuit: vi.fn() } as unknown as ITrayMainService
    const product = new ProductService('2.0.0')
    const policy = new ExternalUrlPolicy(product)

    const service = new NativeHostMainService(
      windowManager,
      configService,
      envService,
      loggerService,
      policy,
      lifecycleService,
      product,
      trayService,
    )

    const channel = createNativeHostChannel(service)
    const client = new NativeHostChannelClient({
      call: <T>(cmd: string, arg?: unknown) => channel.call<T>(1, cmd, arg),
      listen: <T>(evt: string, arg?: unknown) => channel.listen<T>(1, evt, arg),
    })

    expect(await client.getPlatform()).toBe('win32')
    expect(await client.getVersion()).toBe('2.0.0')
    const runtime = await client.getRuntimeInfo()
    expect(runtime.appVersion).toBe('2.0.0')
    expect(runtime.platform).toBe('win32')
    expect(runtime.node.length).toBeGreaterThan(0)

    await client.setSidebarState({
      ...DEFAULT_SIDEBAR_STATE,
      tertiaryOpen: true,
      tertiaryHeight: 150,
    })
    expect((await client.getSidebarState())?.tertiaryHeight).toBe(150)

    const sessionId = '11111111-1111-4111-8111-111111111111'
    await client.setActiveSessionId(sessionId)
    expect(await client.getActiveSessionId()).toBe(sessionId)

    expect(await client.resetWindowLayout()).toEqual(DEFAULT_SIDEBAR_STATE)
    await client.setAlwaysOnTop(true)
    expect(await client.setOpacity(0.5)).toBe(0.5)
    expect(await client.getOpacity()).toBe(0.5)

    await client.minimizeWindow()
    expect(await client.toggleMaximizeWindow()).toBe(true)
    expect(await client.isWindowMaximized()).toBe(true)
    expect(await client.toggleMaximizeWindow()).toBe(false)

    expect(await client.toggleFullScreen()).toBe(true)
    expect(await client.isFullScreen()).toBe(true)
    await client.closeWindow()

    await client.openExternal('https://github.com/bariskisir/BaseApp')
    expect(openExternalMock).toHaveBeenCalledWith('https://github.com/bariskisir/BaseApp')
    await expect(client.openExternal('https://evil.example')).rejects.toThrow('not allowed')

    await client.openDataDirectory()
    await client.openLogsDirectory()
    openPathMock.mockResolvedValueOnce('Access denied')
    await expect(client.openDataDirectory()).rejects.toThrow('Access denied')

    const exportPath = join(dir, 'exported.json')
    showSaveDialogMock.mockResolvedValueOnce({ canceled: true })
    expect(await client.exportConfiguration()).toEqual({ status: 'canceled' })
    showSaveDialogMock.mockResolvedValueOnce({ canceled: false, filePath: exportPath })
    expect(await client.exportConfiguration()).toEqual({
      status: 'completed',
      filePath: exportPath,
    })
    expect(JSON.parse(readFileSync(exportPath, 'utf8')).theme).toBe('dark')

    const importPath = join(dir, 'import.json')
    writeFileSync(importPath, '{"uiLanguage":"tr"}', 'utf8')
    showOpenDialogMock.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    expect(await client.importConfiguration()).toEqual({ status: 'canceled' })
    showOpenDialogMock.mockResolvedValueOnce({ canceled: false, filePaths: [importPath] })
    const imported = await client.importConfiguration()
    expect(imported.status).toBe('completed')

    await client.relaunch()
    expect(trayService.prepareToQuit).toHaveBeenCalledOnce()
    expect(lifecycleService.relaunch).toHaveBeenCalledOnce()
  })
})
