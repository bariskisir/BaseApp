import { Barrier } from '@app/base/common/async'
import { onUnexpectedError } from '@app/base/common/errors'
import { Emitter, type Event } from '@app/base/common/event'
import { Disposable, toDisposable } from '@app/base/common/lifecycle'
import { app, type Event as ElectronEvent } from 'electron'
import {
  type ILifecycleMainService,
  LifecycleMainPhase,
  type WillShutdownEvent,
} from '../common/lifecycle'

export interface ElectronLifecycleApp {
  on(event: 'before-quit', listener: (event: ElectronEvent) => void): unknown
  on(event: 'will-quit', listener: (event: ElectronEvent) => void): unknown
  removeListener(event: 'before-quit', listener: (event: ElectronEvent) => void): unknown
  removeListener(event: 'will-quit', listener: (event: ElectronEvent) => void): unknown
  quit(): void
  relaunch(): void
  exit(exitCode?: number): void
}

interface ShutdownJoiner {
  readonly id: string
  readonly promise: Promise<void>
}

export class LifecycleMainService extends Disposable implements ILifecycleMainService {
  declare readonly _serviceBrand: undefined

  private readonly _onBeforeShutdown = this._register(new Emitter<void>())
  readonly onBeforeShutdown: Event<void> = this._onBeforeShutdown.event

  private readonly _onWillShutdown = this._register(new Emitter<WillShutdownEvent>())
  readonly onWillShutdown: Event<WillShutdownEvent> = this._onWillShutdown.event

  private _phase: LifecycleMainPhase = LifecycleMainPhase.Starting
  private readonly _phaseWhen = new Map<LifecycleMainPhase, Barrier>()
  private _isQuitting = false
  private _beforeShutdownFired = false
  private _willShutdownFired = false
  private _shutdownCompleted = false
  private _pendingShutdown: Promise<void> | undefined
  private readonly _app: ElectronLifecycleApp

  constructor(electronApp: ElectronLifecycleApp = app) {
    super()
    this._app = electronApp

    const onBeforeQuit = (): void => {
      this._isQuitting = true
      this.fireBeforeShutdownOnce()
    }

    const onWillQuit = (event: ElectronEvent): void => {
      if (this._shutdownCompleted) {
        return
      }
      this._isQuitting = true
      this.fireBeforeShutdownOnce()

      if (this._pendingShutdown) {
        event.preventDefault()
        return
      }

      const joiners = this.collectWillShutdownJoiners()
      if (joiners.length === 0) {
        this._shutdownCompleted = true
        return
      }

      event.preventDefault()
      this._pendingShutdown = this.awaitShutdownJoiners(joiners).finally(() => {
        this._shutdownCompleted = true
        this._pendingShutdown = undefined
        this._app.quit()
      })
    }

    this._app.on('before-quit', onBeforeQuit)
    this._app.on('will-quit', onWillQuit)

    this._register(
      toDisposable(() => {
        this._app.removeListener('before-quit', onBeforeQuit)
        this._app.removeListener('will-quit', onWillQuit)
      }),
    )
  }

  get phase(): LifecycleMainPhase {
    return this._phase
  }

  get isQuitting(): boolean {
    return this._isQuitting
  }

  setPhase(value: LifecycleMainPhase): void {
    if (value < this._phase) {
      throw new Error('Lifecycle cannot go backwards')
    }
    if (value === this._phase) {
      return
    }
    this._phase = value
    for (const [phase, barrier] of this._phaseWhen) {
      if (phase <= this._phase) {
        barrier.open()
      }
    }
  }

  async when(phase: LifecycleMainPhase): Promise<void> {
    if (phase <= this._phase) {
      return
    }
    let barrier = this._phaseWhen.get(phase)
    if (!barrier) {
      barrier = new Barrier()
      this._phaseWhen.set(phase, barrier)
    }
    await barrier.wait()
  }

  markQuitting(): void {
    this._isQuitting = true
  }

  quit(): void {
    this._isQuitting = true
    this._app.quit()
  }

  relaunch(): void {
    this._isQuitting = true
    this.fireBeforeShutdownOnce()

    const executeRelaunch = (): void => {
      this._shutdownCompleted = true
      this._app.relaunch()
      this._app.exit(0)
    }

    if (this._pendingShutdown) {
      void this._pendingShutdown.finally(executeRelaunch)
      return
    }

    const joiners = this.collectWillShutdownJoiners()
    if (joiners.length === 0) {
      executeRelaunch()
      return
    }

    this._pendingShutdown = this.awaitShutdownJoiners(joiners).finally(() => {
      this._pendingShutdown = undefined
      executeRelaunch()
    })
  }

  private fireBeforeShutdownOnce(): void {
    if (this._beforeShutdownFired) {
      return
    }
    this._beforeShutdownFired = true
    this._onBeforeShutdown.fire()
  }

  private collectWillShutdownJoiners(): ShutdownJoiner[] {
    if (this._willShutdownFired) {
      return []
    }
    this._willShutdownFired = true
    const joiners: ShutdownJoiner[] = []
    this._onWillShutdown.fire({
      join(id: string, promise: Promise<void>): void {
        joiners.push({ id, promise })
      },
    })
    return joiners
  }

  private async awaitShutdownJoiners(joiners: readonly ShutdownJoiner[]): Promise<void> {
    const results = await Promise.allSettled(joiners.map((entry) => entry.promise))
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index]
      const joiner = joiners[index]
      if (result && result.status === 'rejected') {
        const prefix = joiner ? `Shutdown joiner "${joiner.id}" failed: ` : ''
        onUnexpectedError(
          result.reason instanceof Error
            ? result.reason
            : new Error(`${prefix}${String(result.reason)}`),
        )
      }
    }
  }
}
