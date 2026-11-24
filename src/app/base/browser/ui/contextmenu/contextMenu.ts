import './contextMenu.scss'
import { DisposableStore, type IDisposable, toDisposable } from '@app/base/common/lifecycle'
import { clamp } from '@app/base/common/number'
import { type CodiconName, renderCodicon } from '../../codicons'
import { $, addDisposableListener, isHTMLElement, toggleClass } from '../../dom'
import { hideActiveTooltip } from '../tooltip/tooltip'

const VIEWPORT_PADDING_PX = 6

export interface ContextMenuSeparatorItem {
  readonly type: 'separator'
}

export interface ContextMenuActionItem {
  readonly type?: 'item' | undefined
  readonly id: string
  readonly label: string
  readonly icon?: CodiconName | undefined
  readonly danger?: boolean | undefined
  readonly disabled?: boolean | undefined
  readonly run: () => void
}

export type ContextMenuItem = ContextMenuSeparatorItem | ContextMenuActionItem

export interface ContextMenuAnchor {
  readonly x: number
  readonly y: number
}

interface FocusableMenuEntry {
  readonly item: ContextMenuActionItem
  readonly element: HTMLLIElement
}

let activeContextMenu: IDisposable | null = null

export function hideActiveContextMenu(): void {
  if (activeContextMenu) {
    const current = activeContextMenu
    activeContextMenu = null
    current.dispose()
  }
}

function isSeparatorItem(item: ContextMenuItem): item is ContextMenuSeparatorItem {
  return item.type === 'separator'
}

export function showContextMenu(
  anchor: ContextMenuAnchor,
  items: readonly ContextMenuItem[],
  container: HTMLElement = document.body,
): IDisposable {
  hideActiveTooltip()
  hideActiveContextMenu()

  const previouslyFocused = isHTMLElement(document.activeElement) ? document.activeElement : null
  const store = new DisposableStore()

  const menuElement = $<HTMLDivElement>('div.monaco-menu', {
    role: 'menu',
    tabindex: '-1',
  })
  const listElement = $<HTMLUListElement>('ul.monaco-menu-list')
  menuElement.appendChild(listElement)

  const hasAnyIcon = items.some((item) => !isSeparatorItem(item) && item.icon !== undefined)
  const focusableEntries: FocusableMenuEntry[] = []
  let focusedIndex = -1

  const setFocusedIndex = (nextIndex: number): void => {
    if (focusedIndex >= 0) {
      const previous = focusableEntries[focusedIndex]
      if (previous) {
        toggleClass(previous.element, 'focused', false)
      }
    }
    focusedIndex = nextIndex
    if (focusedIndex >= 0) {
      const current = focusableEntries[focusedIndex]
      if (current) {
        toggleClass(current.element, 'focused', true)
      }
    }
  }

  const moveFocus = (delta: number): void => {
    const count = focusableEntries.length
    if (count === 0) {
      return
    }
    if (focusedIndex < 0) {
      setFocusedIndex(delta > 0 ? 0 : count - 1)
      return
    }
    const nextIndex = (focusedIndex + delta + count) % count
    setFocusedIndex(nextIndex)
  }

  let closed = false
  const close = (restoreFocus: boolean): void => {
    if (closed) {
      return
    }
    closed = true
    if (activeContextMenu === store) {
      activeContextMenu = null
    }
    store.dispose()
    if (restoreFocus && previouslyFocused?.isConnected) {
      previouslyFocused.focus()
    }
  }

  for (const item of items) {
    if (isSeparatorItem(item)) {
      listElement.appendChild(
        $<HTMLLIElement>('li.monaco-menu-separator', {
          role: 'separator',
        }),
      )
      continue
    }

    const row = $<HTMLLIElement>('li.monaco-menu-item', {
      role: 'menuitem',
      'aria-disabled': Boolean(item.disabled),
    })
    toggleClass(row, 'danger', Boolean(item.danger))
    toggleClass(row, 'disabled', Boolean(item.disabled))

    if (hasAnyIcon) {
      const iconSlot = $<HTMLSpanElement>('span.monaco-menu-item-icon')
      if (item.icon) {
        iconSlot.appendChild(renderCodicon(item.icon, 14))
      }
      row.appendChild(iconSlot)
    }

    row.appendChild($<HTMLSpanElement>('span.monaco-menu-item-label', undefined, item.label))

    if (!item.disabled) {
      const entryIndex = focusableEntries.length
      focusableEntries.push({ item, element: row })

      store.add(
        addDisposableListener(row, 'mouseenter', () => {
          setFocusedIndex(entryIndex)
        }),
      )
      store.add(
        addDisposableListener(row, 'mousedown', (event) => {
          event.preventDefault()
        }),
      )
      store.add(
        addDisposableListener(row, 'click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          close(false)
          item.run()
        }),
      )
    }

    listElement.appendChild(row)
  }

  menuElement.style.left = '0px'
  menuElement.style.top = '0px'
  container.appendChild(menuElement)

  const rect = menuElement.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let left = anchor.x
  if (left + rect.width + VIEWPORT_PADDING_PX > viewportWidth) {
    left = anchor.x - rect.width
  }
  left = clamp(
    left,
    VIEWPORT_PADDING_PX,
    Math.max(VIEWPORT_PADDING_PX, viewportWidth - rect.width - VIEWPORT_PADDING_PX),
  )

  let top = anchor.y
  if (top + rect.height + VIEWPORT_PADDING_PX > viewportHeight) {
    top = anchor.y - rect.height
  }
  top = clamp(
    top,
    VIEWPORT_PADDING_PX,
    Math.max(VIEWPORT_PADDING_PX, viewportHeight - rect.height - VIEWPORT_PADDING_PX),
  )

  menuElement.style.left = `${Math.round(left)}px`
  menuElement.style.top = `${Math.round(top)}px`

  menuElement.focus()

  store.add(
    addDisposableListener(menuElement, 'keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        moveFocus(1)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        moveFocus(-1)
      } else if (event.key === 'Home') {
        event.preventDefault()
        if (focusableEntries.length > 0) {
          setFocusedIndex(0)
        }
      } else if (event.key === 'End') {
        event.preventDefault()
        if (focusableEntries.length > 0) {
          setFocusedIndex(focusableEntries.length - 1)
        }
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        const entry = focusedIndex >= 0 ? focusableEntries[focusedIndex] : undefined
        if (entry) {
          close(false)
          entry.item.run()
        }
      } else if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close(true)
      } else if (event.key === 'Tab') {
        event.preventDefault()
        close(true)
      }
    }),
  )

  store.add(
    addDisposableListener(
      document,
      'pointerdown',
      (event) => {
        const target = event.target
        if (target instanceof Node && menuElement.contains(target)) {
          return
        }
        close(false)
      },
      true,
    ),
  )

  store.add(
    addDisposableListener(window, 'blur', () => {
      close(false)
    }),
  )

  store.add(
    addDisposableListener(window, 'resize', () => {
      close(false)
    }),
  )

  store.add(
    addDisposableListener(
      window,
      'scroll',
      () => {
        close(false)
      },
      true,
    ),
  )

  store.add(
    toDisposable(() => {
      menuElement.remove()
      if (activeContextMenu === store) {
        activeContextMenu = null
      }
    }),
  )

  activeContextMenu = store
  return store
}
