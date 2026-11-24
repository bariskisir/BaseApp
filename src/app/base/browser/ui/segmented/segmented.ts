import './segmented.scss'
import { Emitter, type Event } from '@app/base/common/event'
import { DisposableStore, toDisposable } from '@app/base/common/lifecycle'
import { type CodiconName, renderCodicon } from '../../codicons'
import { $, addDisposableListener, clearNode, toggleClass } from '../../dom'
import { Widget } from '../widget'

export interface SegmentedOption<T extends string = string> {
  readonly value: T
  readonly label: string
  readonly icon?: CodiconName | undefined
}

export interface SegmentedControlOptions<T extends string = string> {
  readonly options: readonly SegmentedOption<T>[]
  readonly value: T
  readonly disabled?: boolean | undefined
  readonly ariaLabel?: string | undefined
}

export class SegmentedControl<T extends string = string> extends Widget {
  private readonly _onDidChange = this._register(new Emitter<T>())
  readonly onDidChange: Event<T> = this._onDidChange.event

  private readonly itemDisposables = this._register(new DisposableStore())
  private buttons: HTMLButtonElement[] = []
  private _options: readonly SegmentedOption<T>[]
  private _value: T
  private _disabled: boolean

  constructor(container: HTMLElement, options: SegmentedControlOptions<T>) {
    const group = $<HTMLDivElement>('div.monaco-segmented', {
      role: 'radiogroup',
      'aria-label': options.ariaLabel,
    })
    super(group)

    this._options = [...options.options]
    this._value = options.value
    this._disabled = options.disabled ?? false

    this.renderOptions()

    container.appendChild(this.element)
    this._register(toDisposable(() => this.element.remove()))
  }

  get value(): T {
    return this._value
  }

  set value(nextValue: T) {
    if (this._value !== nextValue) {
      this._value = nextValue
      this.syncSelection()
    }
  }

  setOptions(options: readonly SegmentedOption<T>[], selectedValue?: T): void {
    this._options = [...options]
    if (selectedValue !== undefined) {
      this._value = selectedValue
    }
    this.renderOptions()
  }

  setDisabled(disabled: boolean): void {
    this._disabled = disabled
    this.syncSelection()
  }

  private renderOptions(): void {
    this.itemDisposables.clear()
    clearNode(this.element)
    this.buttons = []

    for (let index = 0; index < this._options.length; index += 1) {
      const option = this._options[index]
      if (!option) {
        continue
      }
      const button = $<HTMLButtonElement>('button.monaco-segmented-option', {
        type: 'button',
        role: 'radio',
      })
      if (option.icon) {
        button.appendChild(renderCodicon(option.icon, 14))
      }
      button.appendChild($<HTMLSpanElement>('span.monaco-segmented-label', undefined, option.label))

      this.itemDisposables.add(
        addDisposableListener(button, 'click', () => {
          if (this._disabled) {
            return
          }
          this.selectOption(option.value)
        }),
      )

      this.itemDisposables.add(
        addDisposableListener(button, 'keydown', (event) => {
          if (this._disabled || this._options.length === 0) {
            return
          }
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            event.preventDefault()
            const nextIndex = (index + 1) % this._options.length
            this.selectByIndex(nextIndex, true)
          } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            event.preventDefault()
            const nextIndex = (index - 1 + this._options.length) % this._options.length
            this.selectByIndex(nextIndex, true)
          }
        }),
      )

      this.buttons.push(button)
      this.element.appendChild(button)
    }

    this.syncSelection()
  }

  private selectByIndex(index: number, focusButton: boolean): void {
    const option = this._options[index]
    if (!option) {
      return
    }
    this.selectOption(option.value)
    if (focusButton) {
      this.buttons[index]?.focus()
    }
  }

  private selectOption(nextValue: T): void {
    if (this._value === nextValue) {
      return
    }
    this._value = nextValue
    this.syncSelection()
    this._onDidChange.fire(this._value)
  }

  private syncSelection(): void {
    toggleClass(this.element, 'disabled', this._disabled)
    const activeIndex = this._options.findIndex((option) => option.value === this._value)
    const focusableIndex = Math.max(activeIndex, 0)

    for (let index = 0; index < this.buttons.length; index += 1) {
      const button = this.buttons[index]
      const option = this._options[index]
      if (!button || !option) {
        continue
      }
      const isActive = option.value === this._value
      toggleClass(button, 'active', isActive)
      button.disabled = this._disabled
      button.setAttribute('aria-checked', isActive ? 'true' : 'false')
      button.tabIndex = this._disabled ? -1 : index === focusableIndex ? 0 : -1
    }
  }
}
