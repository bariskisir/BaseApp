import { Emitter, Event } from '../../../common/event'
import { Disposable, toDisposable } from '../../../common/lifecycle'
import { isObject, isString } from '../../../common/types'
import type { ISandboxIpcRenderer } from '../../sandbox/common/sandboxTypes'
import {
  IPC_EVENT_FIRE_CHANNEL,
  IPC_EVENT_SUBSCRIBE_CHANNEL,
  IPC_EVENT_UNSUBSCRIBE_CHANNEL,
  IPC_INVOKE_CHANNEL,
  type IChannel,
  type IChannelClient,
  type IpcCallPayload,
  type IpcEventPayload,
  type IpcListenPayload,
  type IpcUnlistenPayload,
} from '../common/ipc'

function createSubscriptionKey(channelName: string, eventName: string): string {
  return `${channelName}\0${eventName}`
}

function isIpcEventPayload(value: unknown): value is IpcEventPayload {
  return isObject(value) && isString(value.channelName) && isString(value.eventName)
}

export class ElectronIpcClient extends Disposable implements IChannelClient {
  private readonly ipcRenderer: ISandboxIpcRenderer
  private readonly emitters = new Map<string, Emitter<unknown>>()

  constructor(ipcRenderer: ISandboxIpcRenderer = window.baseapp.ipcRenderer) {
    super()
    this.ipcRenderer = ipcRenderer

    const unsubscribe = this.ipcRenderer.on(IPC_EVENT_FIRE_CHANNEL, (rawPayload) => {
      if (!isIpcEventPayload(rawPayload)) {
        return
      }
      const key = createSubscriptionKey(rawPayload.channelName, rawPayload.eventName)
      this.emitters.get(key)?.fire(rawPayload.data)
    })

    this._register(toDisposable(unsubscribe))
    this._register(
      toDisposable(() => {
        for (const emitter of this.emitters.values()) {
          emitter.dispose()
        }
        this.emitters.clear()
      }),
    )
  }

  getChannel(channelName: string): IChannel {
    return {
      call: <T>(command: string, arg?: unknown): Promise<T> => {
        if (this.isDisposed) {
          return Promise.reject(new Error('IPC client has been disposed'))
        }
        const payload: IpcCallPayload =
          arg === undefined ? { channelName, command } : { channelName, command, arg }
        return this.ipcRenderer.invoke(IPC_INVOKE_CHANNEL, payload) as Promise<T>
      },

      listen: <T>(eventName: string, arg?: unknown): Event<T> => {
        if (this.isDisposed) {
          return Event.None
        }
        const key = createSubscriptionKey(channelName, eventName)
        let emitter = this.emitters.get(key)
        if (!emitter) {
          emitter = new Emitter<unknown>({
            onWillAddFirstListener: () => {
              const listenPayload: IpcListenPayload =
                arg === undefined ? { channelName, eventName } : { channelName, eventName, arg }
              this.ipcRenderer.send(IPC_EVENT_SUBSCRIBE_CHANNEL, listenPayload)
            },
            onDidRemoveLastListener: () => {
              const unlistenPayload: IpcUnlistenPayload = { channelName, eventName }
              this.ipcRenderer.send(IPC_EVENT_UNSUBSCRIBE_CHANNEL, unlistenPayload)
            },
          })
          this.emitters.set(key, emitter)
        }
        return emitter.event as Event<T>
      },
    }
  }
}
