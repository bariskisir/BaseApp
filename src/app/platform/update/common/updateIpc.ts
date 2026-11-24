import type { Event } from '@app/base/common/event'
import type { IChannel, IServerChannel } from '@app/base/parts/ipc/common/ipc'
import { ProxyChannel } from '@app/base/parts/ipc/common/proxyChannel'
import type { IUpdateService, UpdateStateEvent } from './update'

export const UPDATE_CHANNEL_NAME = 'update'

const UPDATE_EVENTS = ['onDidChangeState'] as const

export function createUpdateChannel(service: IUpdateService): IServerChannel<number> {
  return ProxyChannel.fromService(service, {
    eventNames: UPDATE_EVENTS,
  })
}

export class UpdateChannelClient implements IUpdateService {
  declare readonly _serviceBrand: undefined

  readonly onDidChangeState: Event<UpdateStateEvent>
  private readonly proxy: IUpdateService

  constructor(channel: IChannel) {
    this.proxy = ProxyChannel.toService<IUpdateService>(channel, {
      eventNames: UPDATE_EVENTS,
    })
    this.onDidChangeState = this.proxy.onDidChangeState
  }

  getState(): Promise<UpdateStateEvent> {
    return this.proxy.getState()
  }

  checkForUpdates(): Promise<void> {
    return this.proxy.checkForUpdates()
  }

  quitAndInstall(): Promise<void> {
    return this.proxy.quitAndInstall()
  }
}
