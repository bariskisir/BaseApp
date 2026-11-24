import type { IChannel, IServerChannel } from '@app/base/parts/ipc/common/ipc'
import { ProxyChannel } from '@app/base/parts/ipc/common/proxyChannel'
import {
  type ILoggerMainService,
  type LogsSummary,
  type RendererLogEntry,
  rendererLogEntrySchema,
} from './log'

export const LOG_CHANNEL_NAME = 'log'

export interface ILogChannelService {
  writeRenderer(entry: RendererLogEntry): Promise<void>
  getLogsSummary(): Promise<LogsSummary>
  clearLogs(): Promise<LogsSummary>
}

export function createLogChannel(service: ILoggerMainService): IServerChannel<number> {
  const target: ILogChannelService = {
    writeRenderer: async (entry: RendererLogEntry): Promise<void> => {
      service.writeRenderer(entry)
    },
    getLogsSummary: (): Promise<LogsSummary> => service.getLogsSummary(),
    clearLogs: (): Promise<LogsSummary> => service.clearLogs(),
  }

  return ProxyChannel.fromService(target, {
    validators: {
      writeRenderer: (arg: unknown): RendererLogEntry => rendererLogEntrySchema.parse(arg),
    },
  })
}

export class LogChannelClient implements ILogChannelService {
  constructor(private readonly channel: IChannel) {}

  writeRenderer(entry: RendererLogEntry): Promise<void> {
    return this.channel.call<void>('writeRenderer', entry)
  }

  getLogsSummary(): Promise<LogsSummary> {
    return this.channel.call<LogsSummary>('getLogsSummary')
  }

  clearLogs(): Promise<LogsSummary> {
    return this.channel.call<LogsSummary>('clearLogs')
  }
}
