import './slider.scss'
import { Emitter, type Event } from '@app/base/common/event'
import { toDisposable } from '@app/base/common/lifecycle'
import { clamp, snapToStep } from '@app/base/common/number'
import { $, toggleClass } from '../../dom'
import { Widget } from '../widget'

export interface SliderOptions {
  readonly min: number
  readonly max: number
  readonly step: number
  readonly value: number
  readonly disabled?: boolean | undefined
  readonly ariaLabel?: string | undefined
  readonly formatValue?: ((value: number) => string) | undefined
}

export class Slider extends Widget {
  private readonly _onDidInput = this._register(new Emitter<number>())
  readonly onDidInput: Event<number> = this._onDidInput.event

  private readonly _onDidChange = this._register(new Emitter<number>())
  readonly onDidChange: Event<number> = this._onDidChange.event

  private readonly inputElement: HTMLInputElement
  private readonly valueElement: HTMLSpanElement
  private readonly min: number
  private readonly max: number
  private readonly step: number
  private readonly formatValue: (value: number) => string
  private _value: number
  private _disabled: boolean

  constructor(container: HTMLElement, options: SliderOptions) {
    const wrapper = $<HTMLDivElement>('div.monaco-slider')
    super(wrapper)

    this.min = options.min
    this.max = options.max
    this.step = options.step
    this.formatValue = options.formatValue ?? ((value: number) => String(value))
    this._value = snapToStep(options.value, this.min, this.max, this.step)
    this._disabled = options.disabled ?? false

    this.inputElement = $<HTMLInputElement>('input.monaco-slider-input', {
      type: 'range',
      min: String(this.min),
      max: String(this.max),
      step: String(this.step),
      value: String(this._value),
      'aria-label': options.ariaLabel,
    })

    this.valueElement = $<HTMLSpanElement>('span.monaco-slider-value')

    wrapper.appendChild(this.inputElement)
    wrapper.appendChild(this.valueElement)

    this.syncView()

    this.listen(this.inputElement, 'input', () => {
      const parsed = Number(this.inputElement.value)
      if (Number.isNaN(parsed)) {
        return
      }
      this._value = snapToStep(parsed, this.min, this.max, this.step)
      this.syncView()
      this._onDidInput.fire(this._value)
    })

    this.listen(this.inputElement, 'change', () => {
      const parsed = Number(this.inputElement.value)
      if (Number.isNaN(parsed)) {
        return
      }
      this._value = snapToStep(parsed, this.min, this.max, this.step)
      this.syncView()
      this._onDidChange.fire(this._value)
    })

    container.appendChild(this.element)
    this._register(toDisposable(() => this.element.remove()))
  }

  get value(): number {
    return this._value
  }

  set value(nextValue: number) {
    const snapped = snapToStep(nextValue, this.min, this.max, this.step)
    if (this._value !== snapped) {
      this._value = snapped
      this.syncView()
    }
  }

  setDisabled(disabled: boolean): void {
    this._disabled = disabled
    this.syncView()
  }

  private syncView(): void {
    this.inputElement.value = String(this._value)
    this.inputElement.disabled = this._disabled
    toggleClass(this.element, 'disabled', this._disabled)

    const formatted = this.formatValue(this._value)
    this.valueElement.textContent = formatted
    this.inputElement.setAttribute('aria-valuetext', formatted)

    const span = this.max - this.min
    const ratio = span > 0 ? clamp((this._value - this.min) / span, 0, 1) : 0
    this.inputElement.style.setProperty('--monaco-slider-progress', `${(ratio * 100).toFixed(2)}%`)
  }
}
