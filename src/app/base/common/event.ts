import { onUnexpectedError } from './errors'
import {
  Disposable,
  DisposableStore,
  type IDisposable,
  markAsDisposed,
  markAsSingleton,
  toDisposable,
  trackDisposable,
} from './lifecycle'

export type Event<T> = (
  listener: (e: T) => unknown,
  thisArgs?: unknown,
  disposables?: IDisposable[] | DisposableStore,
) => IDisposable

export interface EmitterOptions {
  readonly onWillAddFirstListener?: () => void
  readonly onDidAddFirstListener?: () => void
  readonly onDidAddListener?: () => void
  readonly onDidRemoveLastListener?: () => void
}

interface ListenerEntry<T> {
  readonly callback: (e: T) => unknown
  readonly thisArgs: unknown
}

export interface NodeEventEmitterLike {
  on(event: string | symbol, listener: (...args: unknown[]) => void): unknown
  removeListener(event: string | symbol, listener: (...args: unknown[]) => void): unknown
}

function registerDisposable(
  disposable: IDisposable,
  disposables?: IDisposable[] | DisposableStore,
): IDisposable {
  if (disposables instanceof DisposableStore) {
    disposables.add(disposable)
  } else if (Array.isArray(disposables)) {
    disposables.push(disposable)
  }
  return disposable
}

export class Emitter<T> implements IDisposable {
  private readonly _options: EmitterOptions | undefined
  private readonly _listeners = new Set<ListenerEntry<T>>()
  private _disposed = false
  private _event: Event<T> | undefined

  constructor(options?: EmitterOptions) {
    this._options = options
    trackDisposable(this)
  }

  get event(): Event<T> {
    if (!this._event) {
      this._event = (
        listener: (e: T) => unknown,
        thisArgs?: unknown,
        disposables?: IDisposable[] | DisposableStore,
      ): IDisposable => {
        if (this._disposed) {
          return Disposable.None
        }

        const isFirst = this._listeners.size === 0
        if (isFirst) {
          this._options?.onWillAddFirstListener?.()
        }

        const entry: ListenerEntry<T> = { callback: listener, thisArgs }
        this._listeners.add(entry)

        if (isFirst) {
          this._options?.onDidAddFirstListener?.()
        }
        this._options?.onDidAddListener?.()

        const result = toDisposable(() => {
          if (!this._listeners.delete(entry)) {
            return
          }
          if (!this._disposed && this._listeners.size === 0) {
            this._options?.onDidRemoveLastListener?.()
          }
        })

        return registerDisposable(result, disposables)
      }
    }
    return this._event
  }

  fire(event: T): void {
    if (this._disposed || this._listeners.size === 0) {
      return
    }
    const snapshot = [...this._listeners]
    for (const entry of snapshot) {
      if (!this._listeners.has(entry)) {
        continue
      }
      try {
        entry.callback.call(entry.thisArgs, event)
      } catch (error) {
        onUnexpectedError(error)
      }
    }
  }

  hasListeners(): boolean {
    return this._listeners.size > 0
  }

  dispose(): void {
    if (this._disposed) {
      return
    }
    this._disposed = true
    markAsDisposed(this)
    const hadListeners = this._listeners.size > 0
    this._listeners.clear()
    if (hadListeners) {
      this._options?.onDidRemoveLastListener?.()
    }
  }
}

const noneEvent: Event<never> = () => Disposable.None

function onceEvent<T>(event: Event<T>): Event<T> {
  return (listener, thisArgs, disposables) => {
    let didFire = false
    let result: IDisposable | undefined
    result = event(
      (value) => {
        if (didFire) {
          return
        }
        didFire = true
        result?.dispose()
        listener.call(thisArgs, value)
      },
      undefined,
      disposables,
    )
    if (didFire) {
      result.dispose()
    }
    return result
  }
}

function mapEvent<I, O>(event: Event<I>, mapFn: (input: I) => O): Event<O> {
  return (listener, thisArgs, disposables) =>
    event((value) => listener.call(thisArgs, mapFn(value)), undefined, disposables)
}

function filterEvent<T, U extends T>(event: Event<T>, filterFn: (value: T) => value is U): Event<U>
function filterEvent<T>(event: Event<T>, filterFn: (value: T) => unknown): Event<T>
function filterEvent<T>(event: Event<T>, filterFn: (value: T) => unknown): Event<T> {
  return (listener, thisArgs, disposables) =>
    event(
      (value) => {
        if (filterFn(value)) {
          listener.call(thisArgs, value)
        }
      },
      undefined,
      disposables,
    )
}

function fromNodeEventEmitter<T>(
  emitter: NodeEventEmitterLike,
  eventName: string,
  map: (...args: unknown[]) => T = (first) => first as T,
): Event<T> {
  const fn = (...args: unknown[]): void => {
    result.fire(map(...args))
  }
  const result = markAsSingleton(
    new Emitter<T>({
      onWillAddFirstListener: () => {
        emitter.on(eventName, fn)
      },
      onDidRemoveLastListener: () => {
        emitter.removeListener(eventName, fn)
      },
    }),
  )
  return result.event
}

export const Event = {
  None: noneEvent,
  once: onceEvent,
  map: mapEvent,
  filter: filterEvent,
  fromNodeEventEmitter,
} as const
