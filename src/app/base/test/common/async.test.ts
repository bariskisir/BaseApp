import { Barrier, RunOnceScheduler, Sequencer, timeout } from '@app/base/common/async'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils'

describe('async utilities', () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite()

  afterEach(() => {
    vi.useRealTimers()
  })

  it('blocks until Barrier is opened', async () => {
    const barrier = new Barrier()
    expect(barrier.isOpen()).toBe(false)
    const waitPromise = barrier.wait()
    barrier.open()
    expect(barrier.isOpen()).toBe(true)
    expect(await waitPromise).toBe(true)
  })

  it('debounces, cancels, flushes, and disposes RunOnceScheduler', () => {
    vi.useFakeTimers()
    let runs = 0
    const scheduler = disposables.add(
      new RunOnceScheduler(() => {
        runs += 1
      }, 50),
    )

    scheduler.schedule()
    expect(scheduler.isScheduled()).toBe(true)
    vi.advanceTimersByTime(30)
    scheduler.schedule(50)
    vi.advanceTimersByTime(49)
    expect(runs).toBe(0)
    vi.advanceTimersByTime(1)
    expect(runs).toBe(1)
    expect(scheduler.isScheduled()).toBe(false)

    scheduler.schedule(100)
    scheduler.flush()
    expect(runs).toBe(2)
    expect(scheduler.isScheduled()).toBe(false)

    scheduler.schedule(100)
    scheduler.cancel()
    vi.advanceTimersByTime(200)
    expect(runs).toBe(2)

    scheduler.dispose()
    scheduler.schedule(10)
    vi.advanceTimersByTime(50)
    expect(runs).toBe(2)
  })

  it('serializes tasks in Sequencer even after failures and supports timeout', async () => {
    const sequencer = new Sequencer()
    const order: string[] = []

    const first = sequencer.queue(async () => {
      await timeout(15)
      order.push('first')
      return 1
    })
    const failing = sequencer.queue(async () => {
      order.push('failing')
      throw new Error('task-error')
    })
    const third = sequencer.queue(async () => {
      order.push('third')
      return 3
    })

    expect(await first).toBe(1)
    await expect(failing).rejects.toThrow('task-error')
    expect(await third).toBe(3)
    expect(order).toEqual(['first', 'failing', 'third'])
  })
})
