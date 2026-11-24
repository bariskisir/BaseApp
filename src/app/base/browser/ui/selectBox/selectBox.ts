import './selectBox.scss'
import { Emitter, type Event } from '@app/base/common/event'
import { DisposableStore, MutableDisposable, toDisposable } from '@app/base/common/lifecycle'
import { clamp } from '@app/base/common/number'
import { renderCodicon } from '../../codicons'
import { $, addDisposableListener, toggleClass } from '../../dom'
import { hideActiveTooltip } from '../tooltip/tooltip'
import { Widget } from '../widget'

const DROPDOWN_GAP_PX = 2
const VIEWPORT_PADDING_PX = 6

export interface SelectOption<T extends string = string> {
  readonly value: T
  readonly label: string
}

export interface SelectBoxOptions<T extends string = string> {
  readonly options: readonly SelectOption<T>[]
  readonly value: T
  readonly disabled?: boolean | undefined
  readonly ariaLabel?: string | undefined
}

let nextSelectBoxId = 1

export class SelectBox<T extends string = string> extends Widget {
  declare readonly element: HTMLButtonElement

  private readonly _onDidChange = this._register(new Emitter<T>())
  readonly onDidChange: Event<T> = this._onDidChange.event

  private readonly dropdownDisposables = this._register(new MutableDisposable<DisposableStore>())
  private readonly labelElement: HTMLSpanElement
  private readonly listboxId: string
  private _options: readonly SelectOption<T>[]
  private _value: T
  private _disabled: boolean
  private _isOpen = false
  private _focusedIndex = -1
  private optionElements: HTMLDivElement[] = []

  constructor(container: HTMLElement, options: SelectBoxOptions<T>) {
    const listboxId = `monaco-select-listbox-${nextSelectBoxId}`
    nextSelectBoxId += 1

    const button = $<HTMLButtonElement>('button.monaco-select-box', {
      type: 'button',
      role: 'combobox',
      'aria-haspopup': 'listbox',
      'aria-expanded': false,
      'aria-controls': listboxId,
      'aria-label': options.ariaLabel,
    })
    super(button)

    this.listboxId = listboxId
    this._options = [...options.options]
    this._value = options.value
    this._disabled = options.disabled ?? false

    this.labelElement = $<HTMLSpanElement>('span.monaco-select-box-label')
    const chevronElement = $<HTMLSpanElement>(
      'span.monaco-select-box-chevron',
      undefined,
      renderCodicon('chevron-down', 14),
    )
    this.element.appendChild(this.labelElement)
    this.element.appendChild(chevronElement)

    this.syncTriggerView()

    this.listen(this.element, 'click', (event) => {
      event.preventDefault()
      if (this._disabled) {
        return
      }
      if (this._isOpen) {
        this.close(false)
      } else {
        this.open()
      }
    })

    this.listen(this.element, 'keydown', (event) => {
      if (this._disabled) {
        return
      }
      if (!this._isOpen) {
        if (
          event.key === 'Enter' ||
          event.key === ' ' ||
          event.key === 'ArrowDown' ||
          event.key === 'ArrowUp'
        ) {
          event.preventDefault()
          this.open()
        }
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        this.moveFocus(1)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        this.moveFocus(-1)
      } else if (event.key === 'Home') {
        event.preventDefault()
        this.setFocusedIndex(0)
      } else if (event.key === 'End') {
        event.preventDefault()
        this.setFocusedIndex(this._options.length - 1)
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        this.commitFocusedOption()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        this.close(true)
      } else if (event.key === 'Tab') {
        this.close(false)
      }
    })

    container.appendChild(this.element)
    this._register(toDisposable(() => this.element.remove()))
  }

  get value(): T {
    return this._value
  }

  set value(nextValue: T) {
    if (this._value !== nextValue) {
      this._value = nextValue
      this.syncTriggerView()
      if (this._isOpen) {
        this.close(false)
      }
    }
  }

  setOptions(options: readonly SelectOption<T>[], selectedValue?: T): void {
    this._options = [...options]
    if (selectedValue !== undefined) {
      this._value = selectedValue
    }
    this.syncTriggerView()
    if (this._isOpen) {
      this.close(false)
    }
  }

  setDisabled(disabled: boolean): void {
    this._disabled = disabled
    if (disabled && this._isOpen) {
      this.close(false)
    }
    this.syncTriggerView()
  }

  private syncTriggerView(): void {
    const selected = this._options.find((option) => option.value === this._value)
    this.labelElement.textContent = selected ? selected.label : String(this._value)
    this.element.disabled = this._disabled
    toggleClass(this.element, 'disabled', this._disabled)
  }

  private open(): void {
    if (this._isOpen || this._disabled || this._options.length === 0) {
      return
    }
    hideActiveTooltip()

    const store = new DisposableStore()
    this.dropdownDisposables.value = store
    this._isOpen = true
    toggleClass(this.element, 'open', true)
    this.element.setAttribute('aria-expanded', 'true')

    const dropdown = $<HTMLDivElement>('div.monaco-select-box-dropdown', {
      id: this.listboxId,
      role: 'listbox',
    })

    this.optionElements = []
    let selectedIndex = this._options.findIndex((option) => option.value === this._value)
    if (selectedIndex < 0) {
      selectedIndex = 0
    }

    for (let index = 0; index < this._options.length; index += 1) {
      const option = this._options[index]
      if (!option) {
        continue
      }
      const isSelected = option.value === this._value
      const optionId = `${this.listboxId}-opt-${index}`
      const optionElement = $<HTMLDivElement>(
        'div.monaco-select-box-option',
        {
          id: optionId,
          role: 'option',
          'aria-selected': isSelected,
        },
        $<HTMLSpanElement>('span.monaco-select-box-option-label', undefined, option.label),
        $<HTMLSpanElement>(
          'span.monaco-select-box-option-check',
          undefined,
          renderCodicon('check', 13),
        ),
      )
      toggleClass(optionElement, 'selected', isSelected)

      store.add(
        addDisposableListener(optionElement, 'mouseenter', () => {
          this.setFocusedIndex(index)
        }),
      )
      store.add(
        addDisposableListener(optionElement, 'mousedown', (event) => {
          event.preventDefault()
        }),
      )
      store.add(
        addDisposableListener(optionElement, 'click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          this.selectByIndex(index)
        }),
      )

      this.optionElements.push(optionElement)
      dropdown.appendChild(optionElement)
    }

    document.body.appendChild(dropdown)
    this.positionDropdown(dropdown)
    this.setFocusedIndex(selectedIndex)

    store.add(
      addDisposableListener(
        document,
        'pointerdown',
        (event) => {
          const target = event.target
          if (
            target instanceof Node &&
            (this.element.contains(target) || dropdown.contains(target))
          ) {
            return
          }
          this.close(false)
        },
        true,
      ),
    )

    store.add(
      addDisposableListener(window, 'resize', () => {
        this.close(false)
      }),
    )

    store.add(
      addDisposableListener(window, 'blur', () => {
        this.close(false)
      }),
    )

    store.add(
      addDisposableListener(
        window,
        'scroll',
        (event) => {
          const target = event.target
          if (target instanceof Node && dropdown.contains(target)) {
            return
          }
          this.close(false)
        },
        true,
      ),
    )

    store.add(
      toDisposable(() => {
        dropdown.remove()
        this.optionElements = []
        this._isOpen = false
        this._focusedIndex = -1
        toggleClass(this.element, 'open', false)
        this.element.setAttribute('aria-expanded', 'false')
        this.element.removeAttribute('aria-activedescendant')
      }),
    )
  }

  private positionDropdown(dropdown: HTMLDivElement): void {
    const triggerRect = this.element.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    dropdown.style.minWidth = `${Math.round(triggerRect.width)}px`
    dropdown.style.maxWidth = `${Math.max(120, viewportWidth - VIEWPORT_PADDING_PX * 2)}px`
    dropdown.style.left = '0px'
    dropdown.style.top = '0px'

    const dropRect = dropdown.getBoundingClientRect()
    let top = triggerRect.bottom + DROPDOWN_GAP_PX
    if (top + dropRect.height + VIEWPORT_PADDING_PX > viewportHeight) {
      const aboveTop = triggerRect.top - dropRect.height - DROPDOWN_GAP_PX
      if (aboveTop >= VIEWPORT_PADDING_PX) {
        top = aboveTop
      }
    }
    top = clamp(
      top,
      VIEWPORT_PADDING_PX,
      Math.max(VIEWPORT_PADDING_PX, viewportHeight - dropRect.height - VIEWPORT_PADDING_PX),
    )

    const left = clamp(
      triggerRect.left,
      VIEWPORT_PADDING_PX,
      Math.max(VIEWPORT_PADDING_PX, viewportWidth - dropRect.width - VIEWPORT_PADDING_PX),
    )

    dropdown.style.left = `${Math.round(left)}px`
    dropdown.style.top = `${Math.round(top)}px`
  }

  private moveFocus(delta: number): void {
    if (this._options.length === 0) {
      return
    }
    const base = Math.max(this._focusedIndex, 0)
    const next = clamp(base + delta, 0, this._options.length - 1)
    this.setFocusedIndex(next)
  }

  private setFocusedIndex(index: number): void {
    if (index < 0 || index >= this.optionElements.length) {
      return
    }
    if (this._focusedIndex >= 0) {
      const previous = this.optionElements[this._focusedIndex]
      if (previous) {
        toggleClass(previous, 'focused', false)
      }
    }
    this._focusedIndex = index
    const current = this.optionElements[index]
    if (current) {
      toggleClass(current, 'focused', true)
      if (current.id) {
        this.element.setAttribute('aria-activedescendant', current.id)
      }
      if (typeof current.scrollIntoView === 'function') {
        current.scrollIntoView({ block: 'nearest' })
      }
    }
  }

  private commitFocusedOption(): void {
    if (this._focusedIndex >= 0 && this._focusedIndex < this._options.length) {
      this.selectByIndex(this._focusedIndex)
    } else {
      this.close(true)
    }
  }

  private selectByIndex(index: number): void {
    const option = this._options[index]
    if (!option) {
      this.close(true)
      return
    }
    const changed = option.value !== this._value
    this._value = option.value
    this.syncTriggerView()
    this.close(true)
    if (changed) {
      this._onDidChange.fire(this._value)
    }
  }

  private close(focusTrigger: boolean): void {
    this.dropdownDisposables.clear()
    if (focusTrigger && !this._disabled) {
      this.element.focus()
    }
  }
}
