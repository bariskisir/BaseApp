import { type CodiconName, renderCodicon } from '@app/base/browser/codicons'
import { $, toggleClass } from '@app/base/browser/dom'
import { Button, attachTooltip } from '@app/base/browser/ui'
import type { DisposableStore, IDisposable } from '@app/base/common/lifecycle'
import type { ServicesAccessor } from '@app/platform/instantiation/common/instantiation'

export interface SettingsRowEntry {
  readonly element: HTMLElement
  readonly searchText: string
}

export interface SettingsGroupEntry {
  readonly element: HTMLElement
  readonly rows: readonly SettingsRowEntry[]
}

export interface SettingsViewInstance extends IDisposable {
  readonly element: HTMLElement
  readonly groups: readonly SettingsGroupEntry[]
}

export type SettingsViewFactory = (accessor: ServicesAccessor) => SettingsViewInstance

export type SettingItemLayout = 'stack' | 'inline' | 'checkbox'

export interface SettingItemOptions {
  readonly category?: string | undefined
  readonly title: string
  readonly description?: string | undefined
  readonly keywords?: readonly string[] | undefined
  readonly layout?: SettingItemLayout | undefined
  readonly isModified?: boolean | undefined
  readonly modifiedTooltip?: string | undefined
  readonly resetTooltip?: string | undefined
  readonly onReset?: (() => void) | undefined
}

export interface SettingItemHandle {
  readonly element: HTMLDivElement
  readonly controlContainer: HTMLDivElement
  readonly extraContainer: HTMLDivElement
  readonly entry: SettingsRowEntry
  setTitle(title: string): void
  setDescription(description: string): void
  setModified(modified: boolean): void
}

export interface SettingsGroupHandle {
  readonly element: HTMLElement
  readonly itemsContainer: HTMLDivElement
  toEntry(rows: readonly SettingsRowEntry[]): SettingsGroupEntry
}

export interface InlineNoticeAction {
  readonly label: string
  readonly onClick: () => void
}

export interface InlineNoticeHandle {
  readonly element: HTMLOutputElement
  setVisible(visible: boolean): void
}

function buildSearchText(
  category: string | undefined,
  title: string,
  description: string | undefined,
  keywords: readonly string[] | undefined,
): string {
  const parts: string[] = []
  if (category) {
    parts.push(category)
  }
  parts.push(title)
  if (description) {
    parts.push(description)
  }
  if (keywords) {
    parts.push(...keywords)
  }
  return parts.join(' ').toLowerCase()
}

export function createSettingItem(
  options: SettingItemOptions,
  store: DisposableStore,
): SettingItemHandle {
  const layout: SettingItemLayout = options.layout ?? 'stack'
  let currentTitle = options.title
  let currentDescription = options.description ?? ''
  let currentModified = options.isModified ?? false

  const element = $<HTMLDivElement>('div.setting-item', {
    class: `setting-item-${layout}`,
  })

  const modifiedIndicator = $<HTMLDivElement>('div.setting-item-modified-indicator', {
    'aria-hidden': true,
  })
  if (options.modifiedTooltip) {
    store.add(
      attachTooltip(modifiedIndicator, () =>
        currentModified ? options.modifiedTooltip : undefined,
      ),
    )
  }
  element.appendChild(modifiedIndicator)

  const contents = $<HTMLDivElement>('div.setting-item-contents')
  const infoColumn = $<HTMLDivElement>('div.setting-item-info')

  const headerRow = $<HTMLDivElement>('div.setting-item-header')
  const titleContainer = $<HTMLDivElement>('div.setting-item-title')

  if (options.category) {
    titleContainer.appendChild(
      $<HTMLSpanElement>('span.setting-item-category', undefined, `${options.category}: `),
    )
  }

  const labelElement = $<HTMLSpanElement>('span.setting-item-label', undefined, currentTitle)
  titleContainer.appendChild(labelElement)
  headerRow.appendChild(titleContainer)

  let resetButton: Button | undefined
  if (options.onReset) {
    const resetSlot = $<HTMLDivElement>('div.setting-item-reset-slot')
    resetButton = store.add(
      new Button(resetSlot, {
        icon: 'discard',
        variant: 'icon',
        small: true,
        title: options.resetTooltip,
        ariaLabel: options.resetTooltip,
      }),
    )
    const onReset = options.onReset
    store.add(
      resetButton.onDidClick(() => {
        if (currentModified) {
          onReset()
        }
      }),
    )
    headerRow.appendChild(resetSlot)
  }

  infoColumn.appendChild(headerRow)

  let descriptionElement: HTMLParagraphElement | undefined
  if (layout !== 'checkbox' && options.description !== undefined) {
    descriptionElement = $<HTMLParagraphElement>(
      'p.setting-item-description',
      undefined,
      currentDescription,
    )
    infoColumn.appendChild(descriptionElement)
  }

  const controlContainer = $<HTMLDivElement>('div.setting-item-control')
  const extraContainer = $<HTMLDivElement>('div.setting-item-extra.hidden')

  if (layout === 'inline') {
    const inlineBody = $<HTMLDivElement>(
      'div.setting-item-inline-body',
      undefined,
      infoColumn,
      controlContainer,
    )
    contents.appendChild(inlineBody)
    contents.appendChild(extraContainer)
  } else {
    contents.appendChild(infoColumn)
    contents.appendChild(controlContainer)
    contents.appendChild(extraContainer)
  }

  element.appendChild(contents)

  const syncModified = (): void => {
    toggleClass(element, 'modified', currentModified)
    if (resetButton) {
      resetButton.setEnabled(currentModified)
    }
  }
  syncModified()

  const entry: SettingsRowEntry = {
    element,
    get searchText(): string {
      return buildSearchText(options.category, currentTitle, currentDescription, options.keywords)
    },
  }

  return {
    element,
    controlContainer,
    extraContainer,
    entry,
    setTitle(nextTitle: string): void {
      currentTitle = nextTitle
      labelElement.textContent = nextTitle
    },
    setDescription(nextDescription: string): void {
      currentDescription = nextDescription
      if (descriptionElement) {
        descriptionElement.textContent = nextDescription
      }
    },
    setModified(modified: boolean): void {
      if (currentModified !== modified) {
        currentModified = modified
        syncModified()
      }
    },
  }
}

export function createSettingsGroup(title?: string): SettingsGroupHandle {
  const element = $<HTMLElement>('section.settings-group')
  if (title !== undefined && title.length > 0) {
    element.appendChild($<HTMLHeadingElement>('h2.settings-group-title', undefined, title))
  }
  const itemsContainer = $<HTMLDivElement>('div.settings-group-items')
  element.appendChild(itemsContainer)

  return {
    element,
    itemsContainer,
    toEntry(rows: readonly SettingsRowEntry[]): SettingsGroupEntry {
      return {
        element,
        rows,
      }
    },
  }
}

export function createInlineNotice(
  icon: CodiconName,
  text: string,
  variant: 'info' | 'warning',
  action: InlineNoticeAction | undefined,
  store: DisposableStore,
): InlineNoticeHandle {
  const iconElement = $<HTMLSpanElement>(
    'span.settings-inline-notice-icon',
    undefined,
    renderCodicon(icon, 15),
  )
  const textElement = $<HTMLSpanElement>('span.settings-inline-notice-text', undefined, text)

  const element = $<HTMLOutputElement>(
    'output.settings-inline-notice',
    { class: `settings-inline-notice-${variant}` },
    iconElement,
    textElement,
  )

  if (action) {
    const actionSlot = $<HTMLDivElement>('div.settings-inline-notice-action')
    const button = store.add(
      new Button(actionSlot, {
        label: action.label,
        variant: 'secondary',
        small: true,
      }),
    )
    store.add(button.onDidClick(() => action.onClick()))
    element.appendChild(actionSlot)
  }

  return {
    element,
    setVisible(visible: boolean): void {
      toggleClass(element, 'hidden', !visible)
    },
  }
}
