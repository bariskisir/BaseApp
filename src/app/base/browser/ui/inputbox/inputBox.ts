import './inputBox.scss'
import { Emitter, type Event } from '@app/base/common/event'
import { toDisposable } from '@app/base/common/lifecycle'
import { type CodiconName, renderCodicon } from '../../codicons'
import { $, toggleClass } from '../../dom'
import { Widget } from '../widget'

export interface InputBoxOptions {
  readonly placeholder?: string | undefined
  readonly value?: string | undefined
  readonly prefixIcon?: CodiconName | undefined
  readonly allowClear?: boolean | undefined
  readonly ariaLabel?: string | undefined
  readonly type?: string | undefined
}

export class InputBox extends Widget {
  readonly inputElement: HTMLInputElement

  private readonly _onDidChange = this._register(new Emitter<string>())
  readonly onDidChange: Event<string> = this._onDidChange.event

  private readonly _onDidSubmit = this._register(new Emitter<string>())
  readonly onDidSubmit: Event<string> = this._onDidSubmit.event

  private readonly _onDidEscape = this._register(new Emitter<void>())
  readonly onDidEscape: Event<void> = this._onDidEscape.event

  private readonly clearButton: HTMLButtonElement | null

  constructor(container: HTMLElement, options: InputBoxOptions = {}) {
    const wrapper = $<HTMLDivElement>('div.monaco-inputbox')
    super(wrapper)

    if (options.prefixIcon) {
      const prefix = $<HTMLSpanElement>(
        'span.monaco-inputbox-prefix',
        undefined,
        renderCodicon(options.prefixIcon, 14),
      )
      wrapper.appendChild(prefix)
    }

    this.inputElement = $<HTMLInputElement>('input.monaco-inputbox-input', {
      type: options.type ?? 'text',
      placeholder: options.placeholder,
      'aria-label': options.ariaLabel ?? options.placeholder,
    })
    if (options.value !== undefined) {
      this.inputElement.value = options.value
    }
    wrapper.appendChild(this.inputElement)

    if (options.allowClear) {
      this.clearButton = $<HTMLButtonElement>(
        'button.monaco-inputbox-clear',
        {
          type: 'button',
          tabindex: '-1',
          'aria-label': 'Clear',
        },
        renderCodicon('close', 14),
      )
      wrapper.appendChild(this.clearButton)
      this.listen(this.clearButton, 'mousedown', (event) => {
        event.preventDefault()
      })
      this.listen(this.clearButton, 'click', () => {
        if (this.inputElement.disabled) {
          return
        }
        this.inputElement.value = ''
        this.syncClearVisibility()
        this.inputElement.focus()
        this._onDidChange.fire('')
      })
    } else {
      this.clearButton = null
    }

    this.syncClearVisibility()

    this.listen(this.inputElement, 'input', () => {
      this.syncClearVisibility()
      this._onDidChange.fire(this.inputElement.value)
    })

    this.listen(this.inputElement, 'keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        this._onDidSubmit.fire(this.inputElement.value)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        this._onDidEscape.fire()
      }
    })

    container.appendChild(this.element)
    this._register(toDisposable(() => this.element.remove()))
  }

  get value(): string {
    return this.inputElement.value
  }

  set value(nextValue: string) {
    if (this.inputElement.value !== nextValue) {
      this.inputElement.value = nextValue
      this.syncClearVisibility()
    }
  }

  focus(): void {
    this.inputElement.focus()
  }

  select(): void {
    this.inputElement.select()
  }

  setPlaceholder(text: string): void {
    this.inputElement.placeholder = text
  }

  setDisabled(disabled: boolean): void {
    this.inputElement.disabled = disabled
    toggleClass(this.element, 'disabled', disabled)
    this.syncClearVisibility()
  }

  private syncClearVisibility(): void {
    if (!this.clearButton) {
      return
    }
    const hidden = this.inputElement.value.length === 0 || this.inputElement.disabled
    toggleClass(this.clearButton, 'hidden', hidden)
  }
}
