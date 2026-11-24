import './settingsEditorView.scss'
import { CODICON_NAMES, type CodiconName, renderCodicon } from '@app/base/browser/codicons'
import { $, addDisposableListener, clearNode, toggleClass } from '@app/base/browser/dom'
import { InputBox } from '@app/base/browser/ui'
import { Disposable, DisposableStore, MutableDisposable } from '@app/base/common/lifecycle'
import { IInstantiationService } from '@app/platform/instantiation/common/instantiation'
import {
  type ISettingsCategoryDescriptor,
  getSettingsRegistry,
} from '@app/workbench/common/settingsRegistry'
import { IWorkbenchLayoutService } from '@app/workbench/services/layout/browser/layoutService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import type { SettingsViewFactory, SettingsViewInstance } from './settingsViews/types'

const VALID_CODICONS = new Set<string>(CODICON_NAMES)

function toCodiconName(iconId: string): CodiconName {
  return VALID_CODICONS.has(iconId) ? (iconId as CodiconName) : 'settings-gear'
}

interface MountedSettingsCategory {
  readonly descriptor: ISettingsCategoryDescriptor
  readonly title: string
  readonly tocButton: HTMLButtonElement
  readonly tocCountElement: HTMLSpanElement
  readonly sectionElement: HTMLDivElement
  readonly view: SettingsViewInstance
}

export class SettingsEditorView extends Disposable {
  readonly element: HTMLDivElement

  private readonly searchInput: InputBox
  private readonly resultsCountElement: HTMLSpanElement
  private readonly tocListElement: HTMLDivElement
  private readonly contentPaneElement: HTMLDivElement
  private readonly contentInnerElement: HTMLDivElement
  private readonly emptyStateElement: HTMLDivElement
  private readonly emptyStateTextElement: HTMLSpanElement
  private readonly mountedStore = this._register(new MutableDisposable<DisposableStore>())

  private categories: MountedSettingsCategory[] = []
  private searchQuery = ''

  constructor(
    @IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
    @IWorkbenchLocalizationService
    private readonly localizationService: IWorkbenchLocalizationService,
    @IInstantiationService private readonly instantiationService: IInstantiationService,
  ) {
    super()

    this.element = $<HTMLDivElement>('div.settings-editor')

    const header = $<HTMLDivElement>('div.settings-header')
    const searchContainer = $<HTMLDivElement>('div.settings-search-container')
    this.searchInput = this._register(
      new InputBox(searchContainer, {
        prefixIcon: 'search',
        allowClear: true,
        placeholder: this.localizationService.t('settings.searchPlaceholder'),
        ariaLabel: this.localizationService.t('settings.searchPlaceholder'),
      }),
    )
    this.resultsCountElement = $<HTMLSpanElement>('span.settings-results-count.hidden', {
      role: 'status',
      'aria-live': 'polite',
    })
    header.appendChild(searchContainer)
    header.appendChild(this.resultsCountElement)

    const body = $<HTMLDivElement>('div.settings-body')

    this.tocListElement = $<HTMLDivElement>('div.settings-toc', {
      role: 'tree',
      'aria-label': this.localizationService.t('settings.title'),
    })

    this.contentPaneElement = $<HTMLDivElement>('div.settings-content-pane')
    this.contentInnerElement = $<HTMLDivElement>('div.settings-content-inner')
    this.emptyStateTextElement = $<HTMLSpanElement>(
      'span.settings-empty-text',
      undefined,
      this.localizationService.t('settings.noSearchResults'),
    )
    this.emptyStateElement = $<HTMLDivElement>(
      'div.settings-empty-state.hidden',
      undefined,
      renderCodicon('search', 24),
      this.emptyStateTextElement,
    )
    this.contentPaneElement.appendChild(this.contentInnerElement)
    this.contentPaneElement.appendChild(this.emptyStateElement)

    body.appendChild(this.tocListElement)
    body.appendChild(this.contentPaneElement)

    this.element.appendChild(header)
    this.element.appendChild(body)

    this._register(
      this.searchInput.onDidChange((nextQuery) => {
        this.searchQuery = nextQuery
        this.applyViewState()
      }),
    )
    this._register(
      this.searchInput.onDidEscape(() => {
        if (this.searchQuery.length > 0) {
          this.searchInput.value = ''
          this.searchQuery = ''
          this.applyViewState()
        }
      }),
    )

    this._register(
      this.layoutService.onDidChangeLayout(() => {
        this.applyViewState()
      }),
    )
    this._register(
      this.localizationService.onDidChangeLocale(() => {
        this.rebuildCategories()
      }),
    )
    this._register(
      getSettingsRegistry().onDidChangeCategories(() => {
        this.rebuildCategories()
      }),
    )

    this.rebuildCategories()
  }

  focusSearch(): void {
    this.searchInput.focus()
  }

  private rebuildCategories(): void {
    const store = new DisposableStore()
    this.mountedStore.value = store
    this.categories = []

    const placeholder = this.localizationService.t('settings.searchPlaceholder')
    this.searchInput.setPlaceholder(placeholder)
    this.searchInput.inputElement.setAttribute('aria-label', placeholder)
    this.tocListElement.setAttribute('aria-label', this.localizationService.t('settings.title'))
    this.emptyStateTextElement.textContent = this.localizationService.t('settings.noSearchResults')

    clearNode(this.tocListElement)
    clearNode(this.contentInnerElement)

    const descriptors = getSettingsRegistry().getCategories()
    for (let index = 0; index < descriptors.length; index += 1) {
      const descriptor = descriptors[index]
      if (!descriptor) {
        continue
      }
      const title = this.localizationService.t(descriptor.titleKey)
      const factory = descriptor.component() as SettingsViewFactory
      const view = this.instantiationService.invokeFunction((accessor) => factory(accessor))
      store.add(view)

      const tocCountElement = $<HTMLSpanElement>('span.settings-toc-count.hidden')
      const tocButton = $<HTMLButtonElement>(
        'button.settings-toc-item',
        {
          type: 'button',
          role: 'treeitem',
          'aria-selected': false,
        },
        renderCodicon(toCodiconName(descriptor.iconId), 15),
        $<HTMLSpanElement>('span.settings-toc-label', undefined, title),
        tocCountElement,
      )

      store.add(
        addDisposableListener(tocButton, 'click', () => {
          this.selectCategory(descriptor.id)
        }),
      )
      store.add(
        addDisposableListener(tocButton, 'keydown', (event) => {
          this.handleTocKeydown(index, event)
        }),
      )

      const sectionElement = $<HTMLDivElement>(
        'div.settings-category-section',
        { 'data-category': descriptor.id },
        view.element,
      )

      this.tocListElement.appendChild(tocButton)
      this.contentInnerElement.appendChild(sectionElement)

      this.categories.push({
        descriptor,
        title,
        tocButton,
        tocCountElement,
        sectionElement,
        view,
      })
    }

    this.applyViewState()
  }

  private selectCategory(categoryId: string): void {
    this.layoutService.setSettingsSection(categoryId)
    if (this.searchQuery.trim().length > 0) {
      const target = this.categories.find((entry) => entry.descriptor.id === categoryId)
      if (target && !target.sectionElement.classList.contains('hidden')) {
        target.sectionElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    } else {
      this.contentPaneElement.scrollTop = 0
    }
  }

  private handleTocKeydown(currentIndex: number, event: KeyboardEvent): void {
    if (this.categories.length === 0) {
      return
    }
    let nextIndex = -1
    if (event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % this.categories.length
    } else if (event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + this.categories.length) % this.categories.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = this.categories.length - 1
    }
    if (nextIndex >= 0) {
      event.preventDefault()
      const nextEntry = this.categories[nextIndex]
      if (nextEntry) {
        nextEntry.tocButton.focus()
        this.selectCategory(nextEntry.descriptor.id)
      }
    }
  }

  private resolveActiveCategoryId(): string {
    const currentSection = this.layoutService.settingsSection
    if (this.categories.some((entry) => entry.descriptor.id === currentSection)) {
      return currentSection
    }
    return this.categories[0]?.descriptor.id ?? ''
  }

  private applyViewState(): void {
    const trimmedQuery = this.searchQuery.trim().toLowerCase()
    const tokens = trimmedQuery.length > 0 ? trimmedQuery.split(/\s+/).filter(Boolean) : []
    const isSearching = tokens.length > 0
    const activeCategoryId = this.resolveActiveCategoryId()

    toggleClass(this.contentPaneElement, 'searching', isSearching)

    let totalMatches = 0

    for (const entry of this.categories) {
      const isActive = entry.descriptor.id === activeCategoryId
      toggleClass(entry.tocButton, 'active', isActive)
      entry.tocButton.setAttribute('aria-selected', isActive ? 'true' : 'false')

      if (!isSearching) {
        toggleClass(entry.tocButton, 'no-matches', false)
        toggleClass(entry.tocCountElement, 'hidden', true)
        entry.tocCountElement.textContent = ''
        toggleClass(entry.sectionElement, 'hidden', !isActive)

        for (const group of entry.view.groups) {
          toggleClass(group.element, 'hidden', false)
          for (const row of group.rows) {
            toggleClass(row.element, 'hidden', false)
          }
        }
        continue
      }

      const categoryTitleLower = entry.title.toLowerCase()
      let categoryMatches = 0

      for (const group of entry.view.groups) {
        let groupMatches = 0
        for (const row of group.rows) {
          const haystack = `${categoryTitleLower} ${row.searchText}`
          const matched = tokens.every((token) => haystack.includes(token))
          toggleClass(row.element, 'hidden', !matched)
          if (matched) {
            groupMatches += 1
          }
        }
        toggleClass(group.element, 'hidden', groupMatches === 0)
        categoryMatches += groupMatches
      }

      totalMatches += categoryMatches
      toggleClass(entry.sectionElement, 'hidden', categoryMatches === 0)
      toggleClass(entry.tocButton, 'no-matches', categoryMatches === 0)
      toggleClass(entry.tocCountElement, 'hidden', categoryMatches === 0)
      entry.tocCountElement.textContent = categoryMatches > 0 ? String(categoryMatches) : ''
    }

    if (isSearching) {
      this.resultsCountElement.textContent = this.localizationService.t(
        'settings.searchResultsCount',
        { count: totalMatches },
      )
      toggleClass(this.resultsCountElement, 'hidden', false)
      toggleClass(this.emptyStateElement, 'hidden', totalMatches > 0)
    } else {
      this.resultsCountElement.textContent = ''
      toggleClass(this.resultsCountElement, 'hidden', true)
      toggleClass(this.emptyStateElement, 'hidden', true)
    }
  }
}
