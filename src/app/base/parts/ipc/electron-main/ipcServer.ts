import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron'
import { onUnexpectedError } from '../../../common/errors'
import { Disposable, type IDisposable, toDisposable } from '../../../common/lifecycle'
import { isObject, isString } from '../../../common/types'
import {
  IPC_EVENT_FIRE_CHANNEL,
  IPC_EVENT_SUBSCRIBE_CHANNEL,
  IPC_EVENT_UNSUBSCRIBE_CHANNEL,
  IPC_INVOKE_CHANNEL,
  type IChannelServer,
  type IpcCallPayload,
  type IpcEventPayload,
  type IpcListenPayload,
  type IpcUnlistenPayload,
  type IServerChannel,
} from '../common/ipc'
import { type ValidatedIpcMain, validatedIpcMain } from './validatedIpcMain'

interface SenderSubscriptionState {
  readonly subscriptions: Map<string, IDisposable>
  readonly destroyCleanup: IDisposable
}

function createSubscriptionKey(channelName: string, eventName: string): string {
  return `${channelName}\0${eventName}`
}

function isIpcCallPayload(value: unknown): value is IpcCallPayload {
  return isObject(value) && isString(value.channelName) && isString(value.command)
}

function isIpcListenPayload(value: unknown): value is IpcListenPayload {
  return isObject(value) && isString(value.channelName) && isString(value.eventName)
}

function isIpcUnlistenPayload(value: unknown): value is IpcUnlistenPayload {
  return isObject(value) && isString(value.channelName) && isString(value.eventName)
}

export class ElectronIpcServer extends Disposable implements IChannelServer<number> {
  private readonly ipc: ValidatedIpcMain
  private readonly channels = new Map<string, IServerChannel<number>>()
  private readonly senderSubscriptions = new Map<number, SenderSubscriptionState>()

  constructor(ipc: ValidatedIpcMain = validatedIpcMain) {
    super()
    this.ipc = ipc

    const onInvoke = async (event: IpcMainInvokeEvent, rawPayload: unknown): Promise<unknown> => {
      if (!isIpcCallPayload(rawPayload)) {
        throw new Error('Invalid IPC call payload')
      }
      const channel = this.channels.get(rawPayload.channelName)
      if (!channel) {
        throw new Error(`IPC channel not registered: ${rawPayload.channelName}`)
      }
      return await channel.call(event.sender.id, rawPayload.command, rawPayload.arg)
    }

    const onSubscribe = (event: IpcMainEvent, rawPayload: unknown): void => {
      if (!isIpcListenPayload(rawPayload)) {
        return
      }
      this.handleSubscribe(event.sender, rawPayload)
    }

    const onUnsubscribe = (event: IpcMainEvent, rawPayload: unknown): void => {
      if (!isIpcUnlistenPayload(rawPayload)) {
        return
      }
      this.handleUnsubscribe(event.sender.id, rawPayload)
    }

    this.ipc.handle(IPC_INVOKE_CHANNEL, onInvoke)
    this.ipc.on(IPC_EVENT_SUBSCRIBE_CHANNEL, onSubscribe)
    this.ipc.on(IPC_EVENT_UNSUBSCRIBE_CHANNEL, onUnsubscribe)

    this._register(
      toDisposable(() => {
        this.ipc.removeHandler(IPC_INVOKE_CHANNEL)
        this.ipc.removeListener(IPC_EVENT_SUBSCRIBE_CHANNEL, onSubscribe)
        this.ipc.removeListener(IPC_EVENT_UNSUBSCRIBE_CHANNEL, onUnsubscribe)
        for (const senderId of [...this.senderSubscriptions.keys()]) {
          this.disposeSenderSubscriptions(senderId)
        }
        this.channels.clear()
      }),
    )
  }

  registerChannel(channelName: string, channel: IServerChannel<number>): void {
    this.channels.set(channelName, channel)
  }

  private handleSubscribe(sender: WebContents, payload: IpcListenPayload): void {
    if (sender.isDestroyed()) {
      return
    }
    const channel = this.channels.get(payload.channelName)
    if (!channel) {
      onUnexpectedError(new Error(`IPC channel not registered: ${payload.channelName}`))
      return
    }

    const senderId = sender.id
    const state = this.getOrCreateSenderState(sender)
    const key = createSubscriptionKey(payload.channelName, payload.eventName)

    const existing = state.subscriptions.get(key)
    if (existing) {
      existing.dispose()
      state.subscriptions.delete(key)
    }

    try {
      const sourceEvent = channel.listen(senderId, payload.eventName, payload.arg)
      const subscription = sourceEvent((data) => {
        if (sender.isDestroyed()) {
          this.disposeSenderSubscriptions(senderId)
          return
        }
        const eventPayload: IpcEventPayload = {
          channelName: payload.channelName,
          eventName: payload.eventName,
          data,
        }
        sender.send(IPC_EVENT_FIRE_CHANNEL, eventPayload)
      })
      state.subscriptions.set(key, subscription)
    } catch (error) {
      onUnexpectedError(error)
      if (state.subscriptions.size === 0) {
        this.disposeSenderSubscriptions(senderId)
      }
    }
  }

  private handleUnsubscribe(senderId: number, payload: IpcUnlistenPayload): void {
    const state = this.senderSubscriptions.get(senderId)
    if (!state) {
      return
    }
    const key = createSubscriptionKey(payload.channelName, payload.eventName)
    const subscription = state.subscriptions.get(key)
    if (subscription) {
      state.subscriptions.delete(key)
      subscription.dispose()
    }
    if (state.subscriptions.size === 0) {
      this.disposeSenderSubscriptions(senderId)
    }
  }

  private getOrCreateSenderState(sender: WebContents): SenderSubscriptionState {
    const senderId = sender.id
    const existing = this.senderSubscriptions.get(senderId)
    if (existing) {
      return existing
    }

    const onDestroyed = (): void => {
      this.disposeSenderSubscriptions(senderId)
    }
    sender.once('destroyed', onDestroyed)

    const state: SenderSubscriptionState = {
      subscriptions: new Map(),
      destroyCleanup: toDisposable(() => {
        if (!sender.isDestroyed()) {
          sender.removeListener('destroyed', onDestroyed)
        }
      }),
    }
    this.senderSubscriptions.set(senderId, state)
    return state
  }

  private disposeSenderSubscriptions(senderId: number): void {
    const state = this.senderSubscriptions.get(senderId)
    if (!state) {
      return
    }
    this.senderSubscriptions.delete(senderId)
    state.destroyCleanup.dispose()
    for (const subscription of state.subscriptions.values()) {
      subscription.dispose()
    }
    state.subscriptions.clear()
  }
}
