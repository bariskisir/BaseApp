import { EventEmitter } from 'node:events'
import { setUnexpectedErrorHandler } from '@app/base/common/errors'
import { Emitter } from '@app/base/common/event'
import { ProxyChannel } from '@app/base/parts/ipc/common/proxyChannel'
import { ElectronIpcClient } from '@app/base/parts/ipc/electron-browser/ipcClient'
import { ElectronIpcServer } from '@app/base/parts/ipc/electron-main/ipcServer'
import {
  type IpcMainAdapter,
  ValidatedIpcMain,
  type ValidatedIpcMainEventListener,
  type ValidatedIpcMainInvokeHandler,
  getAllowedDevOrigin,
  setAllowedDevOrigin,
} from '@app/base/parts/ipc/electron-main/validatedIpcMain'
import type {
  ISandboxIpcRenderer,
  SandboxIpcListener,
} from '@app/base/parts/sandbox/common/sandboxTypes'
import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron'
import { afterEach, describe, expect, it } from 'vitest'

function createFakeIpcHarness() {
  const handlers = new Map<string, ValidatedIpcMainInvokeHandler>()
  const eventListeners = new Map<string, Set<ValidatedIpcMainEventListener>>()
  const rendererListeners = new Map<string, Set<SandboxIpcListener>>()

  const adapter: IpcMainAdapter = {
    on(channel, listener) {
      let set = eventListeners.get(channel)
      if (!set) {
        set = new Set()
        eventListeners.set(channel, set)
      }
      set.add(listener)
    },
    once(channel, listener) {
      adapter.on(channel, listener)
    },
    handle(channel, listener) {
      handlers.set(channel, listener)
    },
    removeHandler(channel) {
      handlers.delete(channel)
    },
    removeListener(channel, listener) {
      eventListeners.get(channel)?.delete(listener)
    },
  }

  let destroyed = false
  const webContentsEmitter = new EventEmitter()
  const sender = {
    id: 42,
    isDestroyed: () => destroyed,
    once: (event: string, listener: () => void) => webContentsEmitter.once(event, listener),
    removeListener: (event: string, listener: () => void) =>
      webContentsEmitter.removeListener(event, listener),
    send(channel: string, ...args: unknown[]) {
      for (const listener of [...(rendererListeners.get(channel) ?? [])]) {
        listener(...args)
      }
    },
  } as unknown as WebContents

  const makeEvent = (url = 'file:///app/index.html', hasParent = false) =>
    ({
      sender,
      senderFrame: { url, parent: hasParent ? ({} as unknown) : null },
    }) as unknown as IpcMainEvent & IpcMainInvokeEvent

  const ipcRenderer: ISandboxIpcRenderer = {
    invoke(channel, ...args) {
      const handler = handlers.get(channel)
      if (!handler) {
        return Promise.reject(new Error(`No handler for ${channel}`))
      }
      return Promise.resolve(handler(makeEvent(), ...args))
    },
    send(channel, ...args) {
      for (const listener of [...(eventListeners.get(channel) ?? [])]) {
        listener(makeEvent(), ...args)
      }
    },
    on(channel, listener) {
      let set = rendererListeners.get(channel)
      if (!set) {
        set = new Set()
        rendererListeners.set(channel, set)
      }
      set.add(listener)
      return () => {
        set.delete(listener)
      }
    },
    removeListener(channel, listener) {
      rendererListeners.get(channel)?.delete(listener)
    },
  }

  return {
    adapter,
    handlers,
    eventListeners,
    ipcRenderer,
    makeEvent,
    destroySender() {
      destroyed = true
      webContentsEmitter.emit('destroyed')
    },
  }
}

describe('ValidatedIpcMain, ElectronIpcServer, and ElectronIpcClient', () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite()

  afterEach(() => {
    setAllowedDevOrigin(undefined)
  })

  it('validates channel prefixes, sender frames, file URLs, and allowed dev origins', async () => {
    const harness = createFakeIpcHarness()
    const validated = new ValidatedIpcMain(harness.adapter)

    expect(() => setAllowedDevOrigin('ftp://invalid.local')).toThrow('Invalid development origin')
    setAllowedDevOrigin('http://localhost:5173/index.html')
    expect(getAllowedDevOrigin()).toBe('http://localhost:5173')

    expect(() => validated.handle('other:chan', () => 1)).toThrow('Invalid IPC channel')
    expect(() => validated.on('other:chan', () => undefined)).toThrow('Invalid IPC channel')
    expect(() => validated.once('other:chan', () => undefined)).toThrow('Invalid IPC channel')

    validated.handle('baseapp:echo', (_event, arg) => arg)
    const handler = harness.handlers.get('baseapp:echo')
    expect(handler).toBeDefined()
    if (!handler) {
      throw new Error('Expected baseapp:echo handler')
    }
    expect(await handler(harness.makeEvent('file:///index.html'), 'ok')).toBe('ok')
    expect(await handler(harness.makeEvent('http://localhost:5173/page'), 'dev')).toBe('dev')
    expect(() => handler(harness.makeEvent('https://evil.example'), 'bad')).toThrow(
      'Untrusted IPC sender',
    )
    expect(() => handler(harness.makeEvent('file:///index.html', true), 'subframe')).toThrow(
      'Untrusted IPC sender',
    )
    expect(() => handler(harness.makeEvent('not-a-url'), 'malformed')).toThrow(
      'Untrusted IPC sender',
    )

    const onceValues: unknown[] = []
    validated.once('baseapp:once', (_event, value) => onceValues.push(value))
    const emitOnce = (url: string, value: unknown): void => {
      for (const fn of [...(harness.eventListeners.get('baseapp:once') ?? [])]) {
        fn(harness.makeEvent(url), value)
      }
    }
    emitOnce('https://evil.example', 'ignored')
    emitOnce('file:///index.html', 'first')
    emitOnce('file:///index.html', 'second')
    expect(onceValues).toEqual(['first'])

    const onValues: unknown[] = []
    const onListener: ValidatedIpcMainEventListener = (_event, value) => onValues.push(value)
    validated.on('baseapp:on', onListener)
    validated.on('baseapp:on', onListener)
    for (const fn of [...(harness.eventListeners.get('baseapp:on') ?? [])]) {
      fn(harness.makeEvent('file:///index.html'), 'v1')
    }
    validated.removeListener('baseapp:on', onListener)
    validated.removeListener('baseapp:on', onListener)
    validated.removeHandler('baseapp:echo')
    expect(onValues).toEqual(['v1'])
  })

  it('bridges calls, events, unsubscribe, and sender destruction between ElectronIpcServer and ElectronIpcClient', async () => {
    const harness = createFakeIpcHarness()
    const validated = new ValidatedIpcMain(harness.adapter)
    const server = disposables.add(new ElectronIpcServer(validated))
    const client = disposables.add(new ElectronIpcClient(harness.ipcRenderer))

    const onTick = disposables.add(new Emitter<number>())
    server.registerChannel(
      'counter',
      ProxyChannel.fromService({
        onDidTick: onTick.event,
        async double(n: number) {
          return n * 2
        },
      }),
    )

    const channel = client.getChannel('counter')
    expect(await channel.call<number>('double', 21)).toBe(42)

    const received: number[] = []
    const sub = channel.listen<number>('onDidTick')((value) => received.push(value))
    onTick.fire(1)
    onTick.fire(2)
    expect(received).toEqual([1, 2])

    sub.dispose()
    onTick.fire(3)
    expect(received).toEqual([1, 2])

    const secondSub = disposables.add(
      channel.listen<number>('onDidTick')((value) => received.push(value)),
    )
    harness.destroySender()
    onTick.fire(4)
    expect(received).toEqual([1, 2])
    secondSub.dispose()

    const errors: unknown[] = []
    setUnexpectedErrorHandler((error) => errors.push(error))
    try {
      await expect(harness.ipcRenderer.invoke('baseapp:ipc:call', 'bad')).rejects.toThrow(
        'Invalid IPC call payload',
      )
      await expect(
        harness.ipcRenderer.invoke('baseapp:ipc:call', { channelName: 'missing', command: 'x' }),
      ).rejects.toThrow('IPC channel not registered')
    } finally {
      setUnexpectedErrorHandler((error) => {
        console.error(error)
      })
    }

    client.dispose()
    await expect(channel.call('double', 2)).rejects.toThrow('IPC client has been disposed')
    expect(channel.listen('onDidTick')(() => undefined)).toBeDefined()
  })
})
