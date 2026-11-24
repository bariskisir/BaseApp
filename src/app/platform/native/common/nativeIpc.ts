import type { Event } from '@app/base/common/event'
import type { DesktopPlatform } from '@app/base/common/platform'
import type { IChannel, IServerChannel } from '@app/base/parts/ipc/common/ipc'
import { ProxyChannel } from '@app/base/parts/ipc/common/proxyChannel'
import type {
  ConfigurationExportResult,
  ConfigurationImportResult,
} from '@app/platform/configuration/common/configuration'
import { type SidebarState, sidebarStateSchema } from '@app/platform/window/common/window'
import { z } from 'zod'
import type { INativeHostService, RuntimeInfo } from './native'

export const NATIVE_HOST_CHANNEL_NAME = 'nativeHost'

const activeSessionIdSchema = z.uuid()
const alwaysOnTopSchema = z.boolean({ error: 'Invalid window preference.' })
const opacitySchema = z.number({ error: 'Invalid window opacity.' })
const externalUrlSchema = z.string({ error: 'Invalid external URL.' })

const NATIVE_HOST_EVENTS = [
  'onDidChangeWindowMaximized',
  'onDidChangeWindowFullScreen',
  'onDidRequestOpenSettings',
] as const

export function createNativeHostChannel(service: INativeHostService): IServerChannel<number> {
  return ProxyChannel.fromService(service, {
    validators: {
      setSidebarState: (arg: unknown): SidebarState => sidebarStateSchema.parse(arg),
      setActiveSessionId: (arg: unknown): string => activeSessionIdSchema.parse(arg),
      setAlwaysOnTop: (arg: unknown): boolean => alwaysOnTopSchema.parse(arg),
      setOpacity: (arg: unknown): number => opacitySchema.parse(arg),
      openExternal: (arg: unknown): string => externalUrlSchema.parse(arg),
    },
    eventNames: NATIVE_HOST_EVENTS,
  })
}

export class NativeHostChannelClient implements INativeHostService {
  declare readonly _serviceBrand: undefined

  readonly onDidChangeWindowMaximized: Event<boolean>
  readonly onDidChangeWindowFullScreen: Event<boolean>
  readonly onDidRequestOpenSettings: Event<void>
  private readonly proxy: INativeHostService

  constructor(channel: IChannel) {
    this.proxy = ProxyChannel.toService<INativeHostService>(channel, {
      eventNames: NATIVE_HOST_EVENTS,
    })
    this.onDidChangeWindowMaximized = this.proxy.onDidChangeWindowMaximized
    this.onDidChangeWindowFullScreen = this.proxy.onDidChangeWindowFullScreen
    this.onDidRequestOpenSettings = this.proxy.onDidRequestOpenSettings
  }

  getPlatform(): Promise<DesktopPlatform> {
    return this.proxy.getPlatform()
  }

  getVersion(): Promise<string> {
    return this.proxy.getVersion()
  }

  getRuntimeInfo(): Promise<RuntimeInfo> {
    return this.proxy.getRuntimeInfo()
  }

  getSidebarState(): Promise<SidebarState | null> {
    return this.proxy.getSidebarState()
  }

  setSidebarState(state: SidebarState): Promise<void> {
    return this.proxy.setSidebarState(state)
  }

  getActiveSessionId(): Promise<string | null> {
    return this.proxy.getActiveSessionId()
  }

  setActiveSessionId(id: string): Promise<void> {
    return this.proxy.setActiveSessionId(id)
  }

  resetWindowLayout(): Promise<SidebarState> {
    return this.proxy.resetWindowLayout()
  }

  setAlwaysOnTop(alwaysOnTop: boolean): Promise<void> {
    return this.proxy.setAlwaysOnTop(alwaysOnTop)
  }

  setOpacity(opacity: number): Promise<number> {
    return this.proxy.setOpacity(opacity)
  }

  getOpacity(): Promise<number> {
    return this.proxy.getOpacity()
  }

  minimizeWindow(): Promise<void> {
    return this.proxy.minimizeWindow()
  }

  toggleMaximizeWindow(): Promise<boolean> {
    return this.proxy.toggleMaximizeWindow()
  }

  isWindowMaximized(): Promise<boolean> {
    return this.proxy.isWindowMaximized()
  }

  toggleFullScreen(): Promise<boolean> {
    return this.proxy.toggleFullScreen()
  }

  isFullScreen(): Promise<boolean> {
    return this.proxy.isFullScreen()
  }

  closeWindow(): Promise<void> {
    return this.proxy.closeWindow()
  }

  openExternal(url: string): Promise<void> {
    return this.proxy.openExternal(url)
  }

  openDataDirectory(): Promise<void> {
    return this.proxy.openDataDirectory()
  }

  openLogsDirectory(): Promise<void> {
    return this.proxy.openLogsDirectory()
  }

  exportConfiguration(): Promise<ConfigurationExportResult> {
    return this.proxy.exportConfiguration()
  }

  importConfiguration(): Promise<ConfigurationImportResult> {
    return this.proxy.importConfiguration()
  }

  relaunch(): Promise<void> {
    return this.proxy.relaunch()
  }
}
