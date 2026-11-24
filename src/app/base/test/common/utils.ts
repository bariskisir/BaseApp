import {
  DisposableStore,
  DisposableTracker,
  type IDisposable,
  setDisposableTracker,
} from '@app/base/common/lifecycle'
import { afterEach, beforeEach, onTestFailed } from 'vitest'

export function must<T>(value: T | null | undefined, label = 'value'): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${label} to be defined`)
  }
  return value
}

export async function assertThrowsAsync(
  block: () => Promise<unknown> | unknown,
  message: string | Error = 'Missing expected exception',
): Promise<void> {
  try {
    await block()
  } catch {
    return
  }
  throw message instanceof Error ? message : new Error(message)
}

export function ensureNoDisposablesAreLeakedInTestSuite(): Pick<DisposableStore, 'add'> {
  let tracker: DisposableTracker | undefined
  let store: DisposableStore
  let testFailed = false

  beforeEach(() => {
    testFailed = false
    onTestFailed(() => {
      testFailed = true
    })
    store = new DisposableStore()
    tracker = new DisposableTracker()
    setDisposableTracker(tracker)
  })

  afterEach(() => {
    store.dispose()
    setDisposableTracker(null)
    if (!testFailed && tracker) {
      const result = tracker.computeLeakingDisposables()
      if (result) {
        throw new Error(`There are ${result.leaks.length} undisposed disposables!${result.details}`)
      }
    }
  })

  return {
    add<T extends IDisposable>(disposable: T): T {
      return store.add(disposable)
    },
  }
}

function checkTrackedDisposables(tracker: DisposableTracker): void {
  const result = tracker.computeLeakingDisposables()
  if (result) {
    throw new Error(`There are ${result.leaks.length} undisposed disposables!${result.details}`)
  }
}

export function throwIfDisposablesAreLeaked(body: () => void): void {
  const tracker = new DisposableTracker()
  setDisposableTracker(tracker)
  try {
    body()
  } finally {
    setDisposableTracker(null)
  }
  checkTrackedDisposables(tracker)
}

export async function throwIfDisposablesAreLeakedAsync(body: () => Promise<void>): Promise<void> {
  const tracker = new DisposableTracker()
  setDisposableTracker(tracker)
  try {
    await body()
  } finally {
    setDisposableTracker(null)
  }
  checkTrackedDisposables(tracker)
}
