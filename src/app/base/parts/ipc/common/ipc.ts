import type { Event } from '../../../common/event'

export const IPC_CHANNEL_PREFIX = 'baseapp:'
export const IPC_INVOKE_CHANNEL = 'baseapp:ipc:call'
export const IPC_EVENT_SUBSCRIBE_CHANNEL = 'baseapp:ipc:listen'
export const IPC_EVENT_UNSUBSCRIBE_CHANNEL = 'baseapp:ipc:unlisten'
export const IPC_EVENT_FIRE_CHANNEL = 'baseapp:ipc:event'

export interface IChannel {
  call<T>(command: string, arg?: unknown): Promise<T>
  listen<T>(event: string, arg?: unknown): Event<T>
}

export interface IServerChannel<TContext = number> {
  call<T>(ctx: TContext, command: string, arg?: unknown): Promise<T>
  listen<T>(ctx: TContext, event: string, arg?: unknown): Event<T>
}

export interface IChannelServer<TContext = number> {
  registerChannel(channelName: string, channel: IServerChannel<TContext>): void
}

export interface IChannelClient {
  getChannel(channelName: string): IChannel
}

export interface IpcCallPayload {
  readonly channelName: string
  readonly command: string
  readonly arg?: unknown
}

export interface IpcListenPayload {
  readonly channelName: string
  readonly eventName: string
  readonly arg?: unknown
}

export interface IpcUnlistenPayload {
  readonly channelName: string
  readonly eventName: string
}

export interface IpcEventPayload {
  readonly channelName: string
  readonly eventName: string
  readonly data: unknown
}
