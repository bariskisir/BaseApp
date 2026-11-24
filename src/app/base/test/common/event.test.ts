import { EventEmitter } from 'node:events'
import { setUnexpectedErrorHandler } from '@app/base/common/errors'
import { Emitter, Event } from '@app/base/common/event'
import { DisposableStore, type IDisposable } from '@app/base/common/lifecycle'
import { describe, expect, it } from 'vitest'
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils'

describe('event', () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite()

  it('fires listeners, supports thisArgs and disposables collection, and invokes lifecycle hooks', () => {
    const hooks: string[] = []
    const emitter = disposables.add(
      new Emitter<number>({
        onWillAddFirstListener: () => hooks.push('willFirst'),
        onDidAddFirstListener: () => hooks.push('didFirst'),
        onDidAddListener: () => hooks.push('didAdd'),
        onDidRemoveLastListener: () => hooks.push('didRemoveLast'),
      }),
    )

    const values: number[] = []
    const receiver = { offset: 100 }
    const listenerArray: IDisposable[] = []
    const store = disposables.add(new DisposableStore())

    emitter.event(
      function (this: { offset: number }, value) {
        values.push(this.offset + value)
      },
      receiver,
      listenerArray,
    )
    emitter.event((value) => values.push(value * 2), undefined, store)

    expect(emitter.hasListeners()).toBe(true)
    emitter.fire(5)
    expect(values).toEqual([105, 10])

    for (const item of listenerArray) {
      item.dispose()
    }
    store.dispose()
    expect(emitter.hasListeners()).toBe(false)
    expect(hooks).toEqual(['willFirst', 'didFirst', 'didAdd', 'didAdd', 'didRemoveLast'])

    emitter.dispose()
    const deadSub = emitter.event(() => values.push(999))
    deadSub.dispose()
    emitter.fire(1)
    expect(values).toEqual([105, 10])
  })

  it('handles re-entrant removal and catches listener exceptions via unexpectedErrorHandler', () => {
    const caught: unknown[] = []
    setUnexpectedErrorHandler((error) => caught.push(error))
    try {
      const emitter = disposables.add(new Emitter<string>())
      const received: string[] = []
      let secondSub: IDisposable | undefined

      disposables.add(
        emitter.event((val) => {
          received.push(`first:${val}`)
          secondSub?.dispose()
          throw new Error('listener-failure')
        }),
      )
      secondSub = disposables.add(
        emitter.event((val) => {
          received.push(`second:${val}`)
        }),
      )

      emitter.fire('hello')
      expect(received).toEqual(['first:hello'])
      expect(caught).toHaveLength(1)
    } finally {
      setUnexpectedErrorHandler((error) => {
        console.error(error)
      })
    }
  })

  it('supports Event.None, Event.once, Event.map, Event.filter, and Event.fromNodeEventEmitter', () => {
    const noneSub = Event.None(() => undefined)
    noneSub.dispose()

    const source = disposables.add(new Emitter<number>())
    const onceValues: number[] = []
    disposables.add(Event.once(source.event)((val) => onceValues.push(val)))

    const mappedValues: string[] = []
    disposables.add(
      Event.map(source.event, (value) => `#${value}`)((val) => mappedValues.push(val)),
    )

    const evenValues: number[] = []
    disposables.add(
      Event.filter(source.event, (value) => value % 2 === 0)((val) => evenValues.push(val)),
    )

    source.fire(1)
    source.fire(2)
    source.fire(4)
    expect(onceValues).toEqual([1])
    expect(mappedValues).toEqual(['#1', '#2', '#4'])
    expect(evenValues).toEqual([2, 4])

    const nodeEmitter = new EventEmitter()
    const nodeEvent = Event.fromNodeEventEmitter<string>(
      nodeEmitter,
      'data',
      (first, second) => `${String(first)}:${String(second)}`,
    )
    const nodeReceived: string[] = []
    const nodeSub = nodeEvent((val) => nodeReceived.push(val))
    nodeEmitter.emit('data', 'k', 'v')
    nodeSub.dispose()
    nodeEmitter.emit('data', 'x', 'y')
    expect(nodeReceived).toEqual(['k:v'])
  })
})
