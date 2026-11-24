import type { IDisposable } from './lifecycle'

export class Barrier {
  private _isOpen = false
  private readonly _promise: Promise<boolean>
  private _completePromise!: (value: boolean) => void

  constructor() {
    this._promise = new Promise<boolean>((resolve) => {
      this._completePromise = resolve
    })
  }

  isOpen(): boolean {
    return this._isOpen
  }

  open(): void {
    this._isOpen = true
    this._completePromise(true)
  }

  wait(): Promise<boolean> {
    return this._promise
  }
}

export class RunOnceScheduler implements IDisposable {
  private _runner: (() => void) | null
  private _timeoutToken: ReturnType<typeof setTimeout> | undefined
  private readonly _timeout: number

  constructor(runner: () => void, delay: number) {
    this._runner = runner
    this._timeout = delay
  }

  dispose(): void {
    this.cancel()
    this._runner = null
  }

  isScheduled(): boolean {
    return this._timeoutToken !== undefined
  }

  schedule(delay: number = this._timeout): void {
    this.cancel()
    if (!this._runner) {
      return
    }
    this._timeoutToken = setTimeout(() => {
      this._timeoutToken = undefined
      this._runner?.()
    }, delay)
  }

  cancel(): void {
    if (this._timeoutToken !== undefined) {
      clearTimeout(this._timeoutToken)
      this._timeoutToken = undefined
    }
  }

  flush(): void {
    if (this.isScheduled()) {
      this.cancel()
      this._runner?.()
    }
  }
}

export class Sequencer {
  private current: Promise<unknown> = Promise.resolve(null)

  queue<T>(promiseTask: () => Promise<T>): Promise<T> {
    const next = this.current.then(promiseTask, promiseTask)
    this.current = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }
}

export function timeout(millis: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, millis)
  })
}
