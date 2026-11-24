import './sash.scss'
import { Emitter, type Event } from '@app/base/common/event'
import { DisposableStore, MutableDisposable, toDisposable } from '@app/base/common/lifecycle'
import { $, addDisposableListener, toggleClass } from '../../dom'
import { Widget } from '../widget'

const SASH_KEY_STEP_PX = 16

export type SashOrientation = 'vertical' | 'horizontal'

export interface SashOptions {
  readonly orientation: SashOrientation
  readonly ariaLabel?: string | undefined
}

export class Sash extends Widget {
  private readonly _onDidStart = this._register(new Emitter<void>())
  readonly onDidStart: Event<void> = this._onDidStart.event

  private readonly _onDidChange = this._register(new Emitter<number>())
  readonly onDidChange: Event<number> = this._onDidChange.event

  private readonly _onDidEnd = this._register(new Emitter<void>())
  readonly onDidEnd: Event<void> = this._onDidEnd.event

  private readonly _onDidKeyStep = this._register(new Emitter<number>())
  readonly onDidKeyStep: Event<number> = this._onDidKeyStep.event

  private readonly dragDisposables = this._register(new MutableDisposable<DisposableStore>())
  private readonly orientation: SashOrientation
  private _enabled = true

  constructor(container: HTMLElement, options: SashOptions) {
    const sashElement = $<HTMLDivElement>('div.monaco-sash', {
      class: options.orientation,
      role: 'separator',
      tabindex: '0',
      'aria-orientation': options.orientation,
      'aria-label': options.ariaLabel,
    })
    super(sashElement)

    this.orientation = options.orientation

    this.listen(this.element, 'pointerdown', (event) => {
      if (!this._enabled || event.button !== 0) {
        return
      }
      event.preventDefault()
      this.startDrag(event)
    })

    this.listen(this.element, 'keydown', (event) => {
      if (!this._enabled) {
        return
      }
      const step = this.resolveKeyStep(event.key)
      if (step !== 0) {
        event.preventDefault()
        this._onDidKeyStep.fire(step)
      }
    })

    container.appendChild(this.element)
    this._register(toDisposable(() => this.element.remove()))
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled
    toggleClass(this.element, 'disabled', !enabled)
    this.element.tabIndex = enabled ? 0 : -1
    if (!enabled) {
      this.dragDisposables.clear()
    }
  }

  setAriaValueNow(value: number): void {
    this.element.setAttribute('aria-valuenow', String(Math.round(value)))
  }

  private resolveKeyStep(key: string): number {
    if (this.orientation === 'vertical') {
      if (key === 'ArrowRight') {
        return SASH_KEY_STEP_PX
      }
      if (key === 'ArrowLeft') {
        return -SASH_KEY_STEP_PX
      }
      return 0
    }
    if (key === 'ArrowDown') {
      return SASH_KEY_STEP_PX
    }
    if (key === 'ArrowUp') {
      return -SASH_KEY_STEP_PX
    }
    return 0
  }

  private startDrag(startEvent: PointerEvent): void {
    const startCoord = this.orientation === 'vertical' ? startEvent.clientX : startEvent.clientY
    const bodyClass =
      this.orientation === 'vertical'
        ? 'monaco-sash-dragging-vertical'
        : 'monaco-sash-dragging-horizontal'

    const store = new DisposableStore()
    this.dragDisposables.value = store

    toggleClass(this.element, 'active', true)
    document.body?.classList.add(bodyClass)

    try {
      this.element.setPointerCapture(startEvent.pointerId)
    } catch {
      void 0
    }

    let ended = false
    const finishDrag = (): void => {
      if (ended) {
        return
      }
      ended = true
      this.dragDisposables.clear()
      this._onDidEnd.fire()
    }

    store.add(
      addDisposableListener(window, 'pointermove', (moveEvent) => {
        const currentCoord = this.orientation === 'vertical' ? moveEvent.clientX : moveEvent.clientY
        this._onDidChange.fire(currentCoord - startCoord)
      }),
    )
    store.add(addDisposableListener(window, 'pointerup', finishDrag))
    store.add(addDisposableListener(window, 'pointercancel', finishDrag))
    store.add(addDisposableListener(window, 'blur', finishDrag))
    store.add(
      toDisposable(() => {
        toggleClass(this.element, 'active', false)
        document.body?.classList.remove(bodyClass)
        try {
          if (this.element.hasPointerCapture(startEvent.pointerId)) {
            this.element.releasePointerCapture(startEvent.pointerId)
          }
        } catch {
          void 0
        }
      }),
    )

    this._onDidStart.fire()
  }
}
