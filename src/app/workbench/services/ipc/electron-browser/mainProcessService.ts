import { Disposable } from '@app/base/common/lifecycle'
import type { IChannel } from '@app/base/parts/ipc/common/ipc'
import { ElectronIpcClient } from '@app/base/parts/ipc/electron-browser/ipcClient'
import type { ISandboxIpcRenderer } from '@app/base/parts/sandbox/common/sandboxTypes'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'

export interface IMainProcessService {
  readonly _serviceBrand: undefined
  getChannel(channelName: string): IChannel
}

export const IMainProcessService = createDecorator<IMainProcessService>('mainProcessService')

export class MainProcessService extends Disposable implements IMainProcessService {
  declare readonly _serviceBrand: undefined

  private readonly client: ElectronIpcClient

  constructor(ipcRenderer: ISandboxIpcRenderer = window.baseapp.ipcRenderer) {
    super()
    this.client = this._register(new ElectronIpcClient(ipcRenderer))
  }

  getChannel(channelName: string): IChannel {
    return this.client.getChannel(channelName)
  }
}
