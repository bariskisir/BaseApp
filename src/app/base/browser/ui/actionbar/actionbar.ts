import './actionbar.scss'
import { DisposableStore, toDisposable } from '@app/base/common/lifecycle'
import { type CodiconName, setCodicon } from '../../codicons'
import { $, addDisposableListener, clearNode, toggleClass } from '../../dom'
import { attachTooltip } from '../tooltip/tooltip'
import { Widget } from '../widget'

export interface ActionBarItem {
  readonly id: string
  readonly icon: CodiconName
  readonly title: string
  readonly ariaLabel?: string | undefined
  readonly active?: boolean | undefined
  readonly disabled?: boolean | undefined
  readonly danger?: boolean | undefined
  readonly run: (anchor?: HTMLElement) => void
}

export type ActionBarItemPatch = Partial<Omit<ActionBarItem, 'id'>>

export interface ActionBarOptions {
  readonly orientation?: 'horizontal' | 'vertical' | undefined
  readonly iconSize?: number | undefined
}

interface RenderedActionEntry {
  item: ActionBarItem
  readonly button: HTMLButtonElement
}

export class ActionBar extends Widget {
  private readonly listElement: HTMLUListElement
  private readonly itemDisposables = this._register(new DisposableStore())
  private readonly entries = new Map<string, RenderedActionEntry>()
  private readonly orientation: 'horizontal' | 'vertical'
  private readonly iconSize: number
  private orderedButtons: HTMLButtonElement[] = []

  constructor(container: HTMLElement, options: ActionBarOptions = {}) {
    const orientation = options.orientation ?? 'horizontal'
    const wrapper = $<HTMLDivElement>('div.monaco-action-bar', {
      class: orientation,
      role: 'toolbar',
      'aria-orientation': orientation,
    })
    super(wrapper)

    this.orientation = orientation
    this.iconSize = options.iconSize ?? 16
    this.listElement = $<HTMLUListElement>('ul.actions-container')
    this.element.appendChild(this.listElement)

    container.appendChild(this.element)
    this._register(toDisposable(() => this.element.remove()))
  }

  setItems(items: readonly ActionBarItem[]): void {
    this.itemDisposables.clear()
    this.entries.clear()
    this.orderedButtons = []
    clearNode(this.listElement)

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      if (!item) {
        continue
      }

      const button = $<HTMLButtonElement>('button.action-label', {
        type: 'button',
      })
      const listItem = $<HTMLLIElement>('li.action-item', undefined, button)
      const entry: RenderedActionEntry = { item, button }
      this.entries.set(item.id, entry)
      this.orderedButtons.push(button)

      this.syncEntry(entry)
      this.itemDisposables.add(attachTooltip(button, () => entry.item.title))

      this.itemDisposables.add(
        addDisposableListener(button, 'click', (event) => {
          event.stopPropagation()
          if (entry.item.disabled) {
            return
          }
          entry.item.run(button)
        }),
      )

      this.itemDisposables.add(
        addDisposableListener(button, 'keydown', (event) => {
          const isHorizontal = this.orientation === 'horizontal'
          const nextKey = isHorizontal ? 'ArrowRight' : 'ArrowDown'
          const prevKey = isHorizontal ? 'ArrowLeft' : 'ArrowUp'
          if (event.key === nextKey) {
            event.preventDefault()
            this.focusAdjacent(index, 1)
          } else if (event.key === prevKey) {
            event.preventDefault()
            this.focusAdjacent(index, -1)
          }
        }),
      )

      this.listElement.appendChild(listItem)
    }
  }

  updateItem(id: string, patch: ActionBarItemPatch): void {
    const entry = this.entries.get(id)
    if (!entry) {
      return
    }
    entry.item = {
      ...entry.item,
      ...patch,
    }
    this.syncEntry(entry)
  }

  private syncEntry(entry: RenderedActionEntry): void {
    const { item, button } = entry
    setCodicon(button, item.icon, this.iconSize)
    button.disabled = Boolean(item.disabled)
    button.setAttribute('aria-label', item.ariaLabel ?? item.title)
    if (item.active !== undefined) {
      button.setAttribute('aria-pressed', item.active ? 'true' : 'false')
    } else {
      button.removeAttribute('aria-pressed')
    }
    toggleClass(button, 'active', Boolean(item.active))
    toggleClass(button, 'danger', Boolean(item.danger))
  }

  private focusAdjacent(currentIndex: number, step: number): void {
    const count = this.orderedButtons.length
    if (count === 0) {
      return
    }
    for (let offset = 1; offset <= count; offset += 1) {
      const candidateIndex = (currentIndex + step * offset + count) % count
      const candidate = this.orderedButtons[candidateIndex]
      if (candidate && !candidate.disabled) {
        candidate.focus()
        return
      }
    }
  }
}
