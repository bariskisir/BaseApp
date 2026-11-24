import { contextBridge, type IpcRendererEvent, ipcRenderer, webFrame } from 'electron'
import { IPC_CHANNEL_PREFIX } from '../../ipc/common/ipc'
import type { ISandboxGlobals, SandboxIpcListener } from '../common/sandboxTypes'

type ElectronIpcListener = (event: IpcRendererEvent, ...args: unknown[]) => void

const listenerRegistry = new Map<string, Map<SandboxIpcListener, ElectronIpcListener>>()

function assertAllowedChannel(channel: string): void {
  if (!channel.startsWith(IPC_CHANNEL_PREFIX)) {
    throw new Error(`Unauthorized IPC channel: ${channel}`)
  }
}

function removeTrackedListener(channel: string, listener: SandboxIpcListener): void {
  const channelListeners = listenerRegistry.get(channel)
  const wrapped = channelListeners?.get(listener)
  if (!wrapped) {
    return
  }
  channelListeners?.delete(listener)
  if (channelListeners && channelListeners.size === 0) {
    listenerRegistry.delete(channel)
  }
  ipcRenderer.removeListener(channel, wrapped)
}

const globals: ISandboxGlobals = {
  ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      assertAllowedChannel(channel)
      return ipcRenderer.invoke(channel, ...args)
    },

    send(channel: string, ...args: unknown[]): void {
      assertAllowedChannel(channel)
      ipcRenderer.send(channel, ...args)
    },

    on(channel: string, listener: SandboxIpcListener): () => void {
      assertAllowedChannel(channel)
      let channelListeners = listenerRegistry.get(channel)
      if (!channelListeners) {
        channelListeners = new Map()
        listenerRegistry.set(channel, channelListeners)
      }
      const existing = channelListeners.get(listener)
      if (existing) {
        ipcRenderer.removeListener(channel, existing)
      }
      const wrapped: ElectronIpcListener = (_event, ...args) => {
        listener(...args)
      }
      channelListeners.set(listener, wrapped)
      ipcRenderer.on(channel, wrapped)

      let active = true
      return () => {
        if (!active) {
          return
        }
        active = false
        removeTrackedListener(channel, listener)
      }
    },

    removeListener(channel: string, listener: SandboxIpcListener): void {
      assertAllowedChannel(channel)
      removeTrackedListener(channel, listener)
    },
  },

  webFrame: {
    setZoomLevel(level: number): void {
      if (typeof level !== 'number' || !Number.isFinite(level)) {
        throw new Error('Zoom level must be a finite number')
      }
      webFrame.setZoomLevel(level)
    },

    getZoomLevel(): number {
      return webFrame.getZoomLevel()
    },

    setZoomFactor(factor: number): void {
      if (typeof factor !== 'number' || !Number.isFinite(factor) || factor <= 0) {
        throw new Error('Zoom factor must be a positive finite number')
      }
      webFrame.setZoomFactor(factor)
    },
  },
}

contextBridge.exposeInMainWorld('baseapp', globals)
