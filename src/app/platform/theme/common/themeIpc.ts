import type { Event } from '@app/base/common/event'
import type { IChannel, IServerChannel } from '@app/base/parts/ipc/common/ipc'
import { ProxyChannel } from '@app/base/parts/ipc/common/proxyChannel'
import {
  RESOLVED_THEME_MODES,
  type ResolvedThemeMode,
} from '@app/platform/configuration/common/configuration'
import { z } from 'zod'
import type { IColorScheme } from './theme'

export const THEME_CHANNEL_NAME = 'theme'

export interface IThemeChannelService {
  getColorScheme(): Promise<IColorScheme>
  setTitleBarTheme(theme: ResolvedThemeMode): Promise<void>
  readonly onDidChangeColorScheme: Event<IColorScheme>
}

const resolvedThemeSchema = z.enum(RESOLVED_THEME_MODES, { error: 'Invalid theme.' })

export function createThemeChannel(service: IThemeChannelService): IServerChannel<number> {
  return ProxyChannel.fromService(service, {
    validators: {
      setTitleBarTheme: (arg: unknown): ResolvedThemeMode => resolvedThemeSchema.parse(arg),
    },
    eventNames: ['onDidChangeColorScheme'],
  })
}

export class ThemeChannelClient implements IThemeChannelService {
  readonly onDidChangeColorScheme: Event<IColorScheme>
  private readonly proxy: IThemeChannelService

  constructor(channel: IChannel) {
    this.proxy = ProxyChannel.toService<IThemeChannelService>(channel, {
      eventNames: ['onDidChangeColorScheme'],
    })
    this.onDidChangeColorScheme = this.proxy.onDidChangeColorScheme
  }

  getColorScheme(): Promise<IColorScheme> {
    return this.proxy.getColorScheme()
  }

  setTitleBarTheme(theme: ResolvedThemeMode): Promise<void> {
    return this.proxy.setTitleBarTheme(theme)
  }
}
