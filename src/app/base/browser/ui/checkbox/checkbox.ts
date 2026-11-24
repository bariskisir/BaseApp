import './checkbox.scss'
import { Emitter, type Event } from '@app/base/common/event'
import { toDisposable } from '@app/base/common/lifecycle'
import { renderCodicon } from '../../codicons'
import { $, toggleClass } from '../../dom'
import { attachTooltip } from '../tooltip/tooltip'
import { Widget } from '../widget'

export interface CheckboxOptions {
  readonly checked: boolean
  readonly disabled?: boolean | undefined
  readonly label?: string | undefined
  readonly ariaLabel?: string | undefined
  readonly tooltip?: string | undefined
}

let nextCheckboxLabelId = 1

export class Checkbox extends Widget {
  private readonly _onDidChange = this._register(new Emitter<boolean>())
  readonly onDidChange: Event<boolean> = this._onDidChange.event

  private readonly boxElement: HTMLDivElement
  private _checked: boolean
  private _disabled: boolean

  constructor(container: HTMLElement, options: CheckboxOptions) {
    const wrapper = $<HTMLDivElement>('div.monaco-checkbox-container')
    super(wrapper)

    this._checked = options.checked
    this._disabled = options.disabled ?? false

    this.boxElement = $<HTMLDivElement>(
      'div.monaco-checkbox',
      {
        role: 'checkbox',
        tabindex: this._disabled ? '-1' : '0',
        'aria-checked': this._checked,
        'aria-disabled': this._disabled,
        'aria-label': options.ariaLabel,
      },
      renderCodicon('check', 13),
    )
    wrapper.appendChild(this.boxElement)

    if (options.label !== undefined) {
      const labelId = `monaco-checkbox-label-${nextCheckboxLabelId}`
      nextCheckboxLabelId += 1
      const labelElement = $<HTMLSpanElement>(
        'span.monaco-checkbox-label',
        { id: labelId },
        options.label,
      )
      wrapper.appendChild(labelElement)
      if (!options.ariaLabel) {
        this.boxElement.setAttribute('aria-labelledby', labelId)
      }
    }

    if (options.tooltip !== undefined) {
      this._register(attachTooltip(this.element, options.tooltip))
    }

    this.syncView()

    this.listen(this.element, 'click', (event) => {
      event.preventDefault()
      if (this._disabled) {
        return
      }
      this.boxElement.focus()
      this.toggle()
    })

    this.listen(this.boxElement, 'keydown', (event) => {
      if (this._disabled) {
        return
      }
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        this.toggle()
      }
    })

    container.appendChild(this.element)
    this._register(toDisposable(() => this.element.remove()))
  }

  get checked(): boolean {
    return this._checked
  }

  set checked(value: boolean) {
    if (this._checked !== value) {
      this._checked = value
      this.syncView()
    }
  }

  setDisabled(disabled: boolean): void {
    this._disabled = disabled
    this.syncView()
  }

  private toggle(): void {
    this._checked = !this._checked
    this.syncView()
    this._onDidChange.fire(this._checked)
  }

  private syncView(): void {
    toggleClass(this.boxElement, 'checked', this._checked)
    toggleClass(this.element, 'disabled', this._disabled)
    this.boxElement.setAttribute('aria-checked', this._checked ? 'true' : 'false')
    this.boxElement.setAttribute('aria-disabled', this._disabled ? 'true' : 'false')
    this.boxElement.tabIndex = this._disabled ? -1 : 0
  }
}
