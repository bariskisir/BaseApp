import { release as osRelease, type as osType } from 'node:os'
import { join } from 'node:path'
import type { Event } from '@app/base/common/event'
import type { DesktopPlatform } from '@app/base/common/platform'
import { readJsonFile, writeJsonFileAtomic } from '@app/base/node/atomicFile'
import {
  type ConfigurationExportResult,
  type ConfigurationImportResult,
  IConfigurationService,
  clampWindowOpacity,
} from '@app/platform/configuration/common/configuration'
import { IEnvironmentMainService } from '@app/platform/environment/electron-main/environmentMainService'
import { ILifecycleMainService } from '@app/platform/lifecycle/common/lifecycle'
import { ILoggerMainService } from '@app/platform/log/common/log'
import { IProductService } from '@app/platform/product/common/productService'
import { IExternalUrlPolicy } from '@app/platform/security/common/externalUrlPolicy'
import { ITrayMainService } from '@app/platform/tray/common/tray'
import type { SidebarState } from '@app/platform/window/common/window'
import { IWindowManager } from '@app/platform/window/electron-main/windowManager'
import { type OpenDialogOptions, type SaveDialogOptions, app, dialog, shell } from 'electron'
import type { INativeHostService, RuntimeInfo } from '../common/native'

export class NativeHostMainService implements INativeHostService {
  declare readonly _serviceBrand: undefined

  readonly onDidChangeWindowMaximized: Event<boolean>
  readonly onDidChangeWindowFullScreen: Event<boolean>
  readonly onDidRequestOpenSettings: Event<void>

  constructor(
    @IWindowManager private readonly windowManager: IWindowManager,
    @IConfigurationService private readonly configurationService: IConfigurationService,
    @IEnvironmentMainService private readonly environmentService: IEnvironmentMainService,
    @ILoggerMainService private readonly loggerService: ILoggerMainService,
    @IExternalUrlPolicy private readonly externalUrlPolicy: IExternalUrlPolicy,
    @ILifecycleMainService private readonly lifecycleService: ILifecycleMainService,
    @IProductService private readonly productService: IProductService,
    @ITrayMainService private readonly trayService: ITrayMainService,
  ) {
    this.onDidChangeWindowMaximized = this.windowManager.onDidChangeMaximized
    this.onDidChangeWindowFullScreen = this.windowManager.onDidChangeFullScreen
    this.onDidRequestOpenSettings = this.windowManager.onDidRequestOpenSettings
  }

  async getPlatform(): Promise<DesktopPlatform> {
    return this.environmentService.platform
  }

  async getVersion(): Promise<string> {
    return this.productService.version
  }

  async getRuntimeInfo(): Promise<RuntimeInfo> {
    return {
      appVersion: this.productService.version,
      electron: process.versions.electron ?? 'unknown',
      chromium: process.versions.chrome ?? 'unknown',
      node: process.versions.node ?? 'unknown',
      v8: process.versions.v8 ?? 'unknown',
      os: `${osType()} ${osRelease()}`,
      arch: process.arch,
      platform: this.environmentService.platform,
    }
  }

  async getSidebarState(): Promise<SidebarState | null> {
    return this.windowManager.getSidebarState()
  }

  async setSidebarState(state: SidebarState): Promise<void> {
    this.windowManager.setSidebarState(state)
  }

  async getActiveSessionId(): Promise<string | null> {
    return this.windowManager.getActiveSessionId()
  }

  async setActiveSessionId(id: string): Promise<void> {
    this.windowManager.setActiveSessionId(id)
  }

  async resetWindowLayout(): Promise<SidebarState> {
    return this.windowManager.resetLayout()
  }

  async setAlwaysOnTop(alwaysOnTop: boolean): Promise<void> {
    this.windowManager.getMainWindow()?.setAlwaysOnTop(alwaysOnTop)
  }

  async setOpacity(opacity: number): Promise<number> {
    const clamped = clampWindowOpacity(opacity)
    this.windowManager.getMainWindow()?.setOpacity(clamped)
    return clamped
  }

  async getOpacity(): Promise<number> {
    return this.windowManager.getMainWindow()?.getOpacity() ?? 1
  }

  async minimizeWindow(): Promise<void> {
    this.windowManager.getMainWindow()?.minimize()
  }

  async toggleMaximizeWindow(): Promise<boolean> {
    const window = this.windowManager.getMainWindow()
    if (!window) {
      return false
    }
    if (window.isMaximized()) {
      window.unmaximize()
      return false
    }
    window.maximize()
    return true
  }

  async isWindowMaximized(): Promise<boolean> {
    return this.windowManager.getMainWindow()?.isMaximized() ?? false
  }

  async toggleFullScreen(): Promise<boolean> {
    const window = this.windowManager.getMainWindow()
    if (!window) {
      return false
    }
    const next = !window.isFullScreen()
    window.setFullScreen(next)
    return next
  }

  async isFullScreen(): Promise<boolean> {
    return this.windowManager.getMainWindow()?.isFullScreen() ?? false
  }

  async closeWindow(): Promise<void> {
    this.windowManager.getMainWindow()?.close()
  }

  async openExternal(url: string): Promise<void> {
    const trusted = this.externalUrlPolicy.assertAllowed(url)
    await shell.openExternal(trusted.toString())
  }

  async openDataDirectory(): Promise<void> {
    const failure = await shell.openPath(this.environmentService.dataDirectory)
    if (failure) {
      throw new Error(failure)
    }
  }

  async openLogsDirectory(): Promise<void> {
    const failure = await shell.openPath(this.loggerService.getLogsDirectory())
    if (failure) {
      throw new Error(failure)
    }
  }

  async exportConfiguration(): Promise<ConfigurationExportResult> {
    const window = this.windowManager.getMainWindow()
    const options: SaveDialogOptions = {
      defaultPath: join(app.getPath('documents'), `${this.productService.slug}-settings.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    }
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) {
      return { status: 'canceled' }
    }
    const configuration = this.configurationService.getConfiguration()
    await writeJsonFileAtomic(result.filePath, configuration)
    return { status: 'completed', filePath: result.filePath }
  }

  async importConfiguration(): Promise<ConfigurationImportResult> {
    const window = this.windowManager.getMainWindow()
    const options: OpenDialogOptions = {
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) {
      return { status: 'canceled' }
    }
    const raw = await readJsonFile(filePath)
    const configuration = await this.configurationService.importConfiguration(raw)
    return { status: 'completed', configuration }
  }

  async relaunch(): Promise<void> {
    this.trayService.prepareToQuit()
    this.lifecycleService.relaunch()
  }
}
