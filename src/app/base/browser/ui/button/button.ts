import './button.scss'
import { Emitter, type Event } from '@app/base/common/event'
import { toDisposable } from '@app/base/common/lifecycle'
import { type CodiconName, setCodicon } from '../../codicons'
import { $, clearNode, toggleClass } from '../../dom'
import { attachTooltip } from '../tooltip/tooltip'
import { Widget } from '../widget'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'icon'

export interface ButtonOptions {
  readonly label?: string | undefined
  readonly icon?: CodiconName | undefined
  readonly variant?: ButtonVariant | undefined
  readonly small?: boolean | undefined
  readonly disabled?: boolean | undefined
  readonly loading?: boolean | undefined
  readonly title?: string | undefined
  readonly ariaLabel?: string | undefined
  readonly ariaPressed?: boolean | undefined
}

export class Button extends Widget {
  declare readonly element: HTMLButtonElement

  private readonly _onDidClick = this._register(new Emitter<MouseEvent>())
  readonly onDidClick: Event<MouseEvent> = this._onDidClick.event

  private readonly iconSlot: HTMLSpanElement
  private readonly labelElement: HTMLSpanElement
  private readonly iconSize: number
  private _icon: CodiconName | undefined
  private _label: string | undefined
  private _enabled: boolean
  private _loading: boolean
  private _title: string | undefined
  private readonly _explicitAriaLabel: string | undefined

  constructor(container: HTMLElement, options: ButtonOptions = {}) {
    const variant: ButtonVariant = options.variant ?? 'primary'
    const button = $<HTMLButtonElement>('button.monaco-text-button', {
      type: 'button',
      class: `monaco-button-${variant}`,
    })
    super(button)

    this.iconSize = options.small ? 14 : 16
    this._icon = options.icon
    this._label = options.label
    this._enabled = !(options.disabled ?? false)
    this._loading = options.loading ?? false
    this._title = options.title
    this._explicitAriaLabel = options.ariaLabel

    toggleClass(this.element, 'monaco-button-small', Boolean(options.small))

    this.iconSlot = $<HTMLSpanElement>('span.monaco-button-icon-slot')
    this.labelElement = $<HTMLSpanElement>('span.monaco-button-label')
    this.element.appendChild(this.iconSlot)
    this.element.appendChild(this.labelElement)

    this.syncIcon()
    this.syncLabel()
    this.syncState()
    this.syncAccessibility()
    if (options.ariaPressed !== undefined) {
      this.setAriaPressed(options.ariaPressed)
    }

    this._register(attachTooltip(this.element, () => this._title))
    this.listen(this.element, 'click', (event) => {
      if (!this._enabled || this._loading) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      this._onDidClick.fire(event)
    })

    container.appendChild(this.element)
    this._register(toDisposable(() => this.element.remove()))
  }

  setLabel(label: string | undefined): void {
    this._label = label
    this.syncLabel()
    this.syncAccessibility()
  }

  setIcon(icon: CodiconName | undefined): void {
    this._icon = icon
    this.syncIcon()
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled
    this.syncState()
  }

  setLoading(loading: boolean): void {
    this._loading = loading
    this.syncIcon()
    this.syncState()
  }

  setTitle(title: string | undefined): void {
    this._title = title
    this.syncAccessibility()
  }

  setAriaPressed(pressed: boolean | undefined): void {
    if (pressed === undefined) {
      this.element.removeAttribute('aria-pressed')
    } else {
      this.element.setAttribute('aria-pressed', pressed ? 'true' : 'false')
    }
  }

  focus(): void {
    this.element.focus()
  }

  private syncIcon(): void {
    const activeIcon: CodiconName | undefined = this._loading ? 'loading' : this._icon
    if (activeIcon) {
      setCodicon(this.iconSlot, activeIcon, this.iconSize)
      toggleClass(this.iconSlot, 'hidden', false)
    } else {
      clearNode(this.iconSlot)
      toggleClass(this.iconSlot, 'hidden', true)
    }
  }

  private syncLabel(): void {
    if (this._label !== undefined && this._label.length > 0) {
      this.labelElement.textContent = this._label
      toggleClass(this.labelElement, 'hidden', false)
    } else {
      this.labelElement.textContent = ''
      toggleClass(this.labelElement, 'hidden', true)
    }
  }

  private syncState(): void {
    const isDisabled = !this._enabled || this._loading
    this.element.disabled = isDisabled
    toggleClass(this.element, 'disabled', isDisabled)
    toggleClass(this.element, 'monaco-button-loading', this._loading)
    if (this._loading) {
      this.element.setAttribute('aria-busy', 'true')
    } else {
      this.element.removeAttribute('aria-busy')
    }
  }

  private syncAccessibility(): void {
    const resolvedAriaLabel =
      this._explicitAriaLabel ?? (!this._label && this._title ? this._title : undefined)
    if (resolvedAriaLabel) {
      this.element.setAttribute('aria-label', resolvedAriaLabel)
    } else {
      this.element.removeAttribute('aria-label')
    }
  }
}
