import type { ISandboxGlobals } from '@app/base/parts/sandbox/common/sandboxTypes'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const exposed = new Map<string, unknown>()
const ipcListeners = new Map<string, Set<(...args: unknown[]) => void>>()
const invokeMock = vi.fn(async (_channel: string, ..._args: unknown[]) => 'ok')
const sendMock = vi.fn((_channel: string, ..._args: unknown[]) => undefined)
let currentZoomLevel = 0
let currentZoomFactor = 1

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld(key: string, api: unknown) {
      exposed.set(key, api)
    },
  },
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => invokeMock(channel, ...args),
    send: (channel: string, ...args: unknown[]) => sendMock(channel, ...args),
    on(channel: string, listener: (...args: unknown[]) => void) {
      let set = ipcListeners.get(channel)
      if (!set) {
        set = new Set()
        ipcListeners.set(channel, set)
      }
      set.add(listener)
    },
    removeListener(channel: string, listener: (...args: unknown[]) => void) {
      ipcListeners.get(channel)?.delete(listener)
    },
  },
  webFrame: {
    setZoomLevel(level: number) {
      currentZoomLevel = level
    },
    getZoomLevel() {
      return currentZoomLevel
    },
    setZoomFactor(factor: number) {
      currentZoomFactor = factor
    },
  },
}))

describe('sandbox preload', () => {
  beforeEach(() => {
    invokeMock.mockClear()
    sendMock.mockClear()
    currentZoomLevel = 0
    currentZoomFactor = 1
  })

  it('exposes validated ipcRenderer and webFrame zoom helpers on window.baseapp', async () => {
    await import('@app/base/parts/sandbox/electron-browser/preload')
    const globals = exposed.get('baseapp') as ISandboxGlobals
    expect(globals).toBeDefined()

    expect(() => globals.ipcRenderer.invoke('evil:channel')).toThrow('Unauthorized IPC channel')
    expect(() => globals.ipcRenderer.send('evil:channel')).toThrow('Unauthorized IPC channel')
    expect(() => globals.ipcRenderer.on('evil:channel', () => undefined)).toThrow(
      'Unauthorized IPC channel',
    )
    expect(() => globals.ipcRenderer.removeListener('evil:channel', () => undefined)).toThrow(
      'Unauthorized IPC channel',
    )

    expect(await globals.ipcRenderer.invoke('baseapp:test', 1)).toBe('ok')
    globals.ipcRenderer.send('baseapp:notify', 'hi')
    expect(invokeMock).toHaveBeenCalledWith('baseapp:test', 1)
    expect(sendMock).toHaveBeenCalledWith('baseapp:notify', 'hi')

    const seen: unknown[] = []
    const listener = (...args: unknown[]) => seen.push(args)
    const unsub1 = globals.ipcRenderer.on('baseapp:event', listener)
    const unsub2 = globals.ipcRenderer.on('baseapp:event', listener)
    for (const fn of [...(ipcListeners.get('baseapp:event') ?? [])]) {
      fn({}, 'payload')
    }
    expect(seen).toEqual([['payload']])

    unsub2()
    unsub2()
    unsub1()
    globals.ipcRenderer.removeListener('baseapp:event', listener)

    globals.webFrame.setZoomLevel(2)
    expect(globals.webFrame.getZoomLevel()).toBe(2)
    globals.webFrame.setZoomFactor(1.44)
    expect(currentZoomFactor).toBe(1.44)
    expect(() => globals.webFrame.setZoomLevel(Number.NaN)).toThrow('finite number')
    expect(() => globals.webFrame.setZoomFactor(0)).toThrow('positive finite number')
  })
})
