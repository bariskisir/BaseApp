export interface IDisposable {
  dispose(): void
}

export interface IDisposableTracker {
  trackDisposable(disposable: IDisposable): void
  setParent(child: IDisposable, parent: IDisposable | null): void
  markAsDisposed(disposable: IDisposable): void
  markAsSingleton(disposable: IDisposable): void
}

export interface DisposableInfo {
  readonly value: IDisposable
  source: Error | null
  parent: IDisposable | null
  isSingleton: boolean
  readonly idx: number
}

let disposableTracker: IDisposableTracker | null = null

export function setDisposableTracker(tracker: IDisposableTracker | null): void {
  disposableTracker = tracker
}

export function trackDisposable<T extends IDisposable>(disposable: T): T {
  disposableTracker?.trackDisposable(disposable)
  return disposable
}

export function markAsDisposed(disposable: IDisposable): void {
  disposableTracker?.markAsDisposed(disposable)
}

export function setParentOfDisposable(child: IDisposable, parent: IDisposable | null): void {
  disposableTracker?.setParent(child, parent)
}

export function markAsSingleton<T extends IDisposable>(singleton: T): T {
  disposableTracker?.markAsSingleton(singleton)
  return singleton
}

export class DisposableTracker implements IDisposableTracker {
  private static idx = 0

  private readonly livingDisposables = new Map<IDisposable, DisposableInfo>()

  private getDisposableData(disposable: IDisposable): DisposableInfo {
    let value = this.livingDisposables.get(disposable)
    if (!value) {
      value = {
        parent: null,
        source: null,
        isSingleton: false,
        value: disposable,
        idx: DisposableTracker.idx++,
      }
      this.livingDisposables.set(disposable, value)
    }
    return value
  }

  trackDisposable(disposable: IDisposable, source?: Error): void {
    const data = this.getDisposableData(disposable)
    if (!data.source) {
      data.source = source ?? new Error('Disposable created here')
    }
  }

  setParent(child: IDisposable, parent: IDisposable | null): void {
    const data = this.getDisposableData(child)
    data.parent = parent
  }

  markAsDisposed(disposable: IDisposable): void {
    this.livingDisposables.delete(disposable)
  }

  markAsSingleton(disposable: IDisposable): void {
    this.getDisposableData(disposable).isSingleton = true
  }

  private getRootParent(
    data: DisposableInfo,
    cache: Map<DisposableInfo, DisposableInfo>,
    visited = new Set<DisposableInfo>(),
  ): DisposableInfo {
    const cached = cache.get(data)
    if (cached) {
      return cached
    }
    if (visited.has(data)) {
      return data
    }
    visited.add(data)
    const result = data.parent
      ? this.getRootParent(this.getDisposableData(data.parent), cache, visited)
      : data
    cache.set(data, result)
    return result
  }

  getTrackedDisposables(): IDisposable[] {
    const rootParentCache = new Map<DisposableInfo, DisposableInfo>()
    const leaking: IDisposable[] = []
    for (const [key, value] of this.livingDisposables.entries()) {
      if (value.source !== null && !this.getRootParent(value, rootParentCache).isSingleton) {
        leaking.push(key)
      }
    }
    return leaking
  }

  computeLeakingDisposables(
    maxReported = 10,
  ): { readonly leaks: DisposableInfo[]; readonly details: string } | undefined {
    const rootParentCache = new Map<DisposableInfo, DisposableInfo>()
    const leakingObjects = [...this.livingDisposables.values()].filter(
      (info) => info.source !== null && !this.getRootParent(info, rootParentCache).isSingleton,
    )
    if (leakingObjects.length === 0) {
      return undefined
    }

    const leakingSet = new Set(leakingObjects.map((info) => info.value))
    const uncoveredLeaks = leakingObjects
      .filter((info) => !(info.parent && leakingSet.has(info.parent)))
      .sort((first, second) => first.idx - second.idx)

    if (uncoveredLeaks.length === 0) {
      throw new Error('There are cyclic disposable chains.')
    }

    const sections: string[] = []
    for (let index = 0; index < Math.min(uncoveredLeaks.length, maxReported); index += 1) {
      const leak = uncoveredLeaks[index]
      if (!leak) {
        continue
      }
      const typeName = leak.value.constructor?.name ?? 'Disposable'
      const stack = leak.source?.stack ?? '(no stack trace)'
      sections.push(
        `Leaking disposable ${index + 1}/${uncoveredLeaks.length}: ${typeName}\n${stack}`,
      )
    }
    if (uncoveredLeaks.length > maxReported) {
      sections.push(`... and ${uncoveredLeaks.length - maxReported} more leaking disposables`)
    }

    return {
      leaks: uncoveredLeaks,
      details: `\n${sections.join('\n\n')}\n`,
    }
  }
}

function isIterable<T>(value: unknown): value is Iterable<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function'
  )
}

export function isDisposable(thing: unknown): thing is IDisposable {
  return (
    typeof thing === 'object' &&
    thing !== null &&
    typeof (thing as { dispose?: unknown }).dispose === 'function' &&
    (thing as { dispose: () => void }).dispose.length === 0
  )
}

export function dispose<T extends IDisposable>(disposable: T): T
export function dispose<T extends IDisposable>(disposable: T | undefined): T | undefined
export function dispose<T extends IDisposable, A extends Iterable<T> = Iterable<T>>(
  disposables: A,
): A
export function dispose<T extends IDisposable>(disposables: Array<T>): Array<T>
export function dispose<T extends IDisposable>(disposables: ReadonlyArray<T>): ReadonlyArray<T>
export function dispose<T extends IDisposable>(
  arg: T | Iterable<T> | undefined,
): T | Iterable<T> | undefined {
  if (isIterable<T>(arg)) {
    const errors: unknown[] = []
    for (const item of arg) {
      if (item) {
        try {
          item.dispose()
        } catch (error) {
          errors.push(error)
        }
      }
    }

    if (errors.length === 1) {
      throw errors[0]
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, 'Encountered errors while disposing resources')
    }

    return Array.isArray(arg) ? [] : arg
  }

  if (arg) {
    arg.dispose()
    return arg
  }

  return undefined
}

export function toDisposable(fn: () => void): IDisposable {
  let disposed = false
  const result: IDisposable = {
    dispose(): void {
      if (disposed) {
        return
      }
      disposed = true
      markAsDisposed(result)
      fn()
    },
  }
  return trackDisposable(result)
}

export class DisposableStore implements IDisposable {
  private readonly _toDispose = new Set<IDisposable>()
  private _isDisposed = false

  constructor() {
    trackDisposable(this)
  }

  get isDisposed(): boolean {
    return this._isDisposed
  }

  dispose(): void {
    if (this._isDisposed) {
      return
    }
    markAsDisposed(this)
    this._isDisposed = true
    this.clear()
  }

  clear(): void {
    if (this._toDispose.size === 0) {
      return
    }
    try {
      dispose(this._toDispose)
    } finally {
      this._toDispose.clear()
    }
  }

  add<T extends IDisposable>(disposable: T): T {
    if ((disposable as unknown as DisposableStore) === this) {
      throw new Error('Cannot register a disposable on itself.')
    }
    if (this._isDisposed) {
      disposable.dispose()
      return disposable
    }
    setParentOfDisposable(disposable, this)
    this._toDispose.add(disposable)
    return disposable
  }

  delete<T extends IDisposable>(disposable: T): void {
    if (this._toDispose.delete(disposable)) {
      setParentOfDisposable(disposable, null)
      disposable.dispose()
    }
  }

  deleteAndLeak<T extends IDisposable>(disposable: T): void {
    if (this._toDispose.delete(disposable)) {
      setParentOfDisposable(disposable, null)
    }
  }
}

export abstract class Disposable implements IDisposable {
  static readonly None: IDisposable = Object.freeze<IDisposable>({
    dispose(): void {},
  })

  protected readonly _store = new DisposableStore()

  constructor() {
    trackDisposable(this)
    setParentOfDisposable(this._store, this)
  }

  get isDisposed(): boolean {
    return this._store.isDisposed
  }

  dispose(): void {
    markAsDisposed(this)
    this._store.dispose()
  }

  protected _register<T extends IDisposable>(disposable: T): T {
    if ((disposable as unknown as Disposable) === this) {
      throw new Error('Cannot register a disposable on itself.')
    }
    return this._store.add(disposable)
  }
}

export class MutableDisposable<T extends IDisposable> implements IDisposable {
  private _value: T | undefined
  private _isDisposed = false

  constructor() {
    trackDisposable(this)
  }

  get value(): T | undefined {
    return this._isDisposed ? undefined : this._value
  }

  set value(value: T | undefined) {
    if (this._isDisposed || value === this._value) {
      if (this._isDisposed && value) {
        value.dispose()
      }
      return
    }
    if (this._value) {
      setParentOfDisposable(this._value, null)
      this._value.dispose()
    }
    if (value) {
      setParentOfDisposable(value, this)
    }
    this._value = value
  }

  clear(): void {
    this.value = undefined
  }

  clearAndLeak(): T | undefined {
    const oldValue = this._value
    this._value = undefined
    if (oldValue) {
      setParentOfDisposable(oldValue, null)
    }
    return oldValue
  }

  dispose(): void {
    this._isDisposed = true
    markAsDisposed(this)
    if (this._value) {
      setParentOfDisposable(this._value, null)
      this._value.dispose()
      this._value = undefined
    }
  }
}
