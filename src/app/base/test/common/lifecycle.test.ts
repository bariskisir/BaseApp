import {
  Disposable,
  DisposableStore,
  DisposableTracker,
  type IDisposable,
  MutableDisposable,
  dispose,
  isDisposable,
  markAsSingleton,
  setDisposableTracker,
  toDisposable,
} from '@app/base/common/lifecycle'
import { describe, expect, it } from 'vitest'
import {
  assertThrowsAsync,
  ensureNoDisposablesAreLeakedInTestSuite,
  throwIfDisposablesAreLeaked,
  throwIfDisposablesAreLeakedAsync,
} from './utils'

class TestDisposable extends Disposable {
  disposedCount = 0

  registerChild<T extends IDisposable>(child: T): T {
    return this._register(child)
  }

  override dispose(): void {
    this.disposedCount += 1
    super.dispose()
  }
}

describe('lifecycle', () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite()

  it('checks isDisposable accurately', () => {
    const valid = disposables.add(toDisposable(() => undefined))
    expect(isDisposable(valid)).toBe(true)
    expect(isDisposable(null)).toBe(false)
    expect(isDisposable(undefined)).toBe(false)
    expect(isDisposable({})).toBe(false)
    expect(isDisposable({ dispose: (_arg: number) => undefined })).toBe(false)
  })

  it('handles toDisposable idempotency', () => {
    let calls = 0
    const disposable = toDisposable(() => {
      calls += 1
    })
    disposable.dispose()
    disposable.dispose()
    expect(calls).toBe(1)
  })

  it('disposes single items, arrays, sets, and rethrows errors properly', () => {
    expect(dispose(undefined)).toBeUndefined()

    const single = toDisposable(() => undefined)
    expect(dispose(single)).toBe(single)

    const items = [toDisposable(() => undefined), toDisposable(() => undefined)]
    expect(dispose(items)).toEqual([])

    const failingOne = [
      toDisposable(() => {
        throw new Error('boom-1')
      }),
    ]
    expect(() => dispose(failingOne)).toThrow('boom-1')

    const failingMany = new Set<IDisposable>([
      toDisposable(() => {
        throw new Error('err-a')
      }),
      toDisposable(() => {
        throw new Error('err-b')
      }),
    ])
    expect(() => dispose(failingMany)).toThrow(AggregateError)
  })

  it('manages DisposableStore lifecycle, delete, deleteAndLeak, and self-registration guard', () => {
    const store = disposables.add(new DisposableStore())
    expect(() => store.add(store)).toThrow('Cannot register a disposable on itself.')

    let deleted = false
    const removable = toDisposable(() => {
      deleted = true
    })
    store.add(removable)
    store.delete(removable)
    expect(deleted).toBe(true)

    let leaked = false
    const detached = toDisposable(() => {
      leaked = true
    })
    store.add(detached)
    store.deleteAndLeak(detached)
    store.clear()
    expect(leaked).toBe(false)
    detached.dispose()
    expect(leaked).toBe(true)

    store.dispose()
    expect(store.isDisposed).toBe(true)
    store.dispose()

    let disposedImmediately = false
    store.add(
      toDisposable(() => {
        disposedImmediately = true
      }),
    )
    expect(disposedImmediately).toBe(true)
  })

  it('manages Disposable subclass registration and guards against self-registration', () => {
    const parent = disposables.add(new TestDisposable())
    expect(() => parent.registerChild(parent)).toThrow('Cannot register a disposable on itself.')

    let childDisposed = false
    parent.registerChild(
      toDisposable(() => {
        childDisposed = true
      }),
    )
    expect(parent.isDisposed).toBe(false)
    parent.dispose()
    expect(parent.isDisposed).toBe(true)
    expect(childDisposed).toBe(true)
  })

  it('manages MutableDisposable replacement, clear, clearAndLeak, and post-dispose assignment', () => {
    const holder = disposables.add(new MutableDisposable<IDisposable>())
    let firstDisposed = false
    let secondDisposed = false
    let thirdDisposed = false

    const first = toDisposable(() => {
      firstDisposed = true
    })
    holder.value = first
    expect(holder.value).toBe(first)
    holder.value = first
    expect(firstDisposed).toBe(false)

    const second = toDisposable(() => {
      secondDisposed = true
    })
    holder.value = second
    expect(firstDisposed).toBe(true)
    expect(holder.value).toBe(second)

    const leaked = holder.clearAndLeak()
    expect(leaked).toBe(second)
    expect(secondDisposed).toBe(false)
    leaked?.dispose()
    expect(secondDisposed).toBe(true)

    holder.clear()
    holder.dispose()
    expect(holder.value).toBeUndefined()

    holder.value = toDisposable(() => {
      thirdDisposed = true
    })
    expect(thirdDisposed).toBe(true)
  })

  it('tracks leaked disposables, respects markAsSingleton, and validates leak helpers', async () => {
    const customTracker = new DisposableTracker()
    setDisposableTracker(customTracker)

    const singletonStore = markAsSingleton(new DisposableStore())
    singletonStore.add(toDisposable(() => undefined))
    expect(customTracker.getTrackedDisposables()).toEqual([])
    expect(customTracker.computeLeakingDisposables()).toBeUndefined()

    const orphan = toDisposable(() => undefined)
    expect(customTracker.getTrackedDisposables()).toContain(orphan)
    const report = customTracker.computeLeakingDisposables(1)
    expect(report?.leaks.length).toBe(1)
    expect(report?.details).toContain('Leaking disposable 1/1')
    orphan.dispose()
    singletonStore.dispose()
    setDisposableTracker(null)

    expect(() =>
      throwIfDisposablesAreLeaked(() => {
        toDisposable(() => undefined)
      }),
    ).toThrow(/undisposed disposables/)

    throwIfDisposablesAreLeaked(() => {
      const clean = toDisposable(() => undefined)
      clean.dispose()
    })

    await assertThrowsAsync(
      () =>
        throwIfDisposablesAreLeakedAsync(async () => {
          toDisposable(() => undefined)
        }),
      'Expected async leak detection',
    )

    await throwIfDisposablesAreLeakedAsync(async () => {
      const clean = toDisposable(() => undefined)
      clean.dispose()
    })

    await assertThrowsAsync(async () => {
      await assertThrowsAsync(async () => 'no-error', 'custom failure')
    })
  })
})
