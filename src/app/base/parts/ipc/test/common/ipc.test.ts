import { Emitter } from '@app/base/common/event'
import { isObject, isString } from '@app/base/common/types'
import { ProxyChannel } from '@app/base/parts/ipc/common/proxyChannel'
import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import { describe, expect, it } from 'vitest'

describe('ProxyChannel and common type guards', () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite()

  it('validates common type guards', () => {
    expect(isString('x')).toBe(true)
    expect(isString(1)).toBe(false)
    expect(isObject({})).toBe(true)
    expect(isObject(null)).toBe(false)
    expect(isObject([])).toBe(false)
    expect(isObject(/a/)).toBe(false)
    expect(isObject(new Date())).toBe(false)
  })

  it('proxies calls, array arguments, validators, errors, and events between client and server', async () => {
    const changed = disposables.add(new Emitter<number>())
    const customStream = disposables.add(new Emitter<string>())

    interface SampleService {
      readonly _serviceBrand?: undefined
      readonly onDidChange: typeof changed.event
      readonly stream: typeof customStream.event
      ping(): Promise<string>
      add(a: number, b: number): Promise<number>
      echo(value: string): Promise<string>
    }

    const impl: SampleService = {
      onDidChange: changed.event,
      stream: customStream.event,
      async ping() {
        return 'pong'
      },
      async add(a: number, b: number) {
        return a + b
      },
      async echo(value: string) {
        return value.toUpperCase()
      },
    }

    const serverChannel = ProxyChannel.fromService(impl, {
      eventNames: ['stream'],
      validators: {
        echo: (arg) => {
          if (typeof arg !== 'string') {
            throw new Error('Expected string')
          }
          return arg
        },
      },
    })

    const clientChannel = {
      call: <T>(command: string, arg?: unknown): Promise<T> =>
        serverChannel.call<T>(1, command, arg),
      listen: <T>(event: string, arg?: unknown) => serverChannel.listen<T>(1, event, arg),
    }

    const proxy = ProxyChannel.toService<SampleService>(clientChannel, { eventNames: ['stream'] })

    expect(await proxy.ping()).toBe('pong')
    expect(await proxy.add(3, 4)).toBe(7)
    expect(await proxy.echo('ok')).toBe('OK')
    expect(proxy._serviceBrand).toBeUndefined()
    expect((proxy as unknown as { then?: unknown }).then).toBeUndefined()

    await expect(serverChannel.call(1, 'echo', 123)).rejects.toThrow('Expected string')
    await expect(serverChannel.call(1, 'constructor')).rejects.toThrow('Method not found')
    await expect(serverChannel.call(1, 'missing')).rejects.toThrow('Method not found')
    expect(() => serverChannel.listen(1, '__proto__')).toThrow('Event not found')
    expect(() => serverChannel.listen(1, 'ping')).toThrow('Event not found')
    expect(() => serverChannel.listen(1, 'onDidMissing')).toThrow('Event not found')

    const seenNumbers: number[] = []
    const seenStrings: string[] = []
    disposables.add(proxy.onDidChange((n) => seenNumbers.push(n)))
    disposables.add(proxy.stream((s) => seenStrings.push(s)))
    changed.fire(7)
    customStream.fire('hi')

    expect(seenNumbers).toEqual([7])
    expect(seenStrings).toEqual(['hi'])
  })
})
