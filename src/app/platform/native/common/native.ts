import type { Event } from '@app/base/common/event'
import type { DesktopPlatform } from '@app/base/common/platform'
import type {
  ConfigurationExportResult,
  ConfigurationImportResult,
} from '@app/platform/configuration/common/configuration'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'
import type { SidebarState } from '@app/platform/window/common/window'

export interface RuntimeInfo {
  readonly appVersion: string
  readonly electron: string
  readonly chromium: string
  readonly node: string
  readonly v8: string
  readonly os: string
  readonly arch: string
  readonly platform: DesktopPlatform
}

export interface INativeHostService {
  readonly _serviceBrand: undefined
  getPlatform(): Promise<DesktopPlatform>
  getVersion(): Promise<string>
  getRuntimeInfo(): Promise<RuntimeInfo>
  getSidebarState(): Promise<SidebarState | null>
  setSidebarState(state: SidebarState): Promise<void>
  getActiveSessionId(): Promise<string | null>
  setActiveSessionId(id: string): Promise<void>
  resetWindowLayout(): Promise<SidebarState>
  setAlwaysOnTop(alwaysOnTop: boolean): Promise<void>
  setOpacity(opacity: number): Promise<number>
  getOpacity(): Promise<number>
  minimizeWindow(): Promise<void>
  toggleMaximizeWindow(): Promise<boolean>
  isWindowMaximized(): Promise<boolean>
  toggleFullScreen(): Promise<boolean>
  isFullScreen(): Promise<boolean>
  closeWindow(): Promise<void>
  openExternal(url: string): Promise<void>
  openDataDirectory(): Promise<void>
  openLogsDirectory(): Promise<void>
  exportConfiguration(): Promise<ConfigurationExportResult>
  importConfiguration(): Promise<ConfigurationImportResult>
  relaunch(): Promise<void>
  readonly onDidChangeWindowMaximized: Event<boolean>
  readonly onDidChangeWindowFullScreen: Event<boolean>
  readonly onDidRequestOpenSettings: Event<void>
}

export const INativeHostService = createDecorator<INativeHostService>('nativeHostService')
