import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { IPC_CHANNEL_PREFIX } from '../common/ipc'

export type ValidatedIpcMainEventListener = (event: IpcMainEvent, ...args: unknown[]) => void

export type ValidatedIpcMainInvokeHandler<T = unknown> = (
  event: IpcMainInvokeEvent,
  ...args: unknown[]
) => Promise<T> | T

export interface IpcMainAdapter {
  on(channel: string, listener: ValidatedIpcMainEventListener): unknown
  once(channel: string, listener: ValidatedIpcMainEventListener): unknown
  handle(channel: string, listener: ValidatedIpcMainInvokeHandler): void
  removeHandler(channel: string): void
  removeListener(channel: string, listener: ValidatedIpcMainEventListener): unknown
}

let configuredDevOrigin: string | undefined

export function setAllowedDevOrigin(url: string | undefined): void {
  if (!url) {
    configuredDevOrigin = undefined
    return
  }
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid development origin protocol: ${parsed.protocol}`)
  }
  configuredDevOrigin = parsed.origin
}

export function getAllowedDevOrigin(): string | undefined {
  return configuredDevOrigin
}

function isAllowedSenderUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'file:') {
      return true
    }
    return (
      configuredDevOrigin !== undefined &&
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.origin === configuredDevOrigin
    )
  } catch {
    return false
  }
}

export class ValidatedIpcMain {
  private readonly ipc: IpcMainAdapter
  private readonly listeners = new Map<
    string,
    Map<ValidatedIpcMainEventListener, ValidatedIpcMainEventListener>
  >()

  constructor(ipc: IpcMainAdapter = ipcMain) {
    this.ipc = ipc
  }

  on(channel: string, listener: ValidatedIpcMainEventListener): void {
    this.assertValidChannel(channel)
    const wrapped: ValidatedIpcMainEventListener = (event, ...args) => {
      if (!this.isValidEvent(channel, event)) {
        return
      }
      listener(event, ...args)
    }
    this.trackListener(channel, listener, wrapped)
    this.ipc.on(channel, wrapped)
  }

  once(channel: string, listener: ValidatedIpcMainEventListener): void {
    this.assertValidChannel(channel)
    const wrapped: ValidatedIpcMainEventListener = (event, ...args) => {
      if (!this.isValidEvent(channel, event)) {
        return
      }
      this.removeListener(channel, listener)
      listener(event, ...args)
    }
    this.trackListener(channel, listener, wrapped)
    this.ipc.on(channel, wrapped)
  }

  handle<T = unknown>(channel: string, listener: ValidatedIpcMainInvokeHandler<T>): void {
    this.assertValidChannel(channel)
    this.ipc.handle(channel, (event, ...args) => {
      if (!this.isValidEvent(channel, event)) {
        throw new Error(`Untrusted IPC sender for channel "${channel}"`)
      }
      return listener(event, ...args)
    })
  }

  removeHandler(channel: string): void {
    this.assertValidChannel(channel)
    this.ipc.removeHandler(channel)
  }

  removeListener(channel: string, listener: ValidatedIpcMainEventListener): void {
    this.assertValidChannel(channel)
    const channelMap = this.listeners.get(channel)
    const wrapped = channelMap?.get(listener)
    if (!wrapped) {
      return
    }
    channelMap?.delete(listener)
    if (channelMap && channelMap.size === 0) {
      this.listeners.delete(channel)
    }
    this.ipc.removeListener(channel, wrapped)
  }

  isValidEvent(channel: string, event: IpcMainEvent | IpcMainInvokeEvent): boolean {
    if (!channel.startsWith(IPC_CHANNEL_PREFIX)) {
      return false
    }
    const senderFrame = event.senderFrame
    if (senderFrame === null || senderFrame.parent !== null) {
      return false
    }
    return isAllowedSenderUrl(senderFrame.url)
  }

  private assertValidChannel(channel: string): void {
    if (!channel.startsWith(IPC_CHANNEL_PREFIX)) {
      throw new Error(`Invalid IPC channel: ${channel}`)
    }
  }

  private trackListener(
    channel: string,
    original: ValidatedIpcMainEventListener,
    wrapped: ValidatedIpcMainEventListener,
  ): void {
    let channelMap = this.listeners.get(channel)
    if (!channelMap) {
      channelMap = new Map()
      this.listeners.set(channel, channelMap)
    }
    const existing = channelMap.get(original)
    if (existing) {
      this.ipc.removeListener(channel, existing)
    }
    channelMap.set(original, wrapped)
  }
}

export const validatedIpcMain = new ValidatedIpcMain()
