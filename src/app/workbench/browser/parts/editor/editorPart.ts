import './editorPart.scss'
import { renderCodicon } from '@app/base/browser/codicons'
import { $, addDisposableListener, toggleClass } from '@app/base/browser/dom'
import { attachTooltip } from '@app/base/browser/ui'
import { MutableDisposable } from '@app/base/common/lifecycle'
import { IInstantiationService } from '@app/platform/instantiation/common/instantiation'
import { Part } from '@app/workbench/browser/part'
import {
  IWorkbenchLayoutService,
  Parts,
} from '@app/workbench/services/layout/browser/layoutService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { IWorkbenchSessionsService } from '@app/workbench/services/sessions/browser/sessionsWorkbenchService'
import { SettingsEditorView } from './settingsEditorView'
import { WelcomeEditorView } from './welcomeEditorView'

export class EditorPart extends Part {
  protected readonly partClassName = 'editor'

  private workspaceTabElement: HTMLDivElement | undefined
  private workspaceTabLabel: HTMLSpanElement | undefined
  private settingsTabElement: HTMLDivElement | undefined
  private settingsTabLabel: HTMLSpanElement | undefined
  private settingsCloseButton: HTMLButtonElement | undefined
  private contentElement: HTMLDivElement | undefined
  private welcomeView: WelcomeEditorView | undefined
  private readonly settingsViewSlot = this._register(new MutableDisposable<SettingsEditorView>())
  private settingsTabOpen = false

  constructor(
    @IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
    @IWorkbenchSessionsService private readonly sessionsService: IWorkbenchSessionsService,
    @IWorkbenchLocalizationService
    private readonly localizationService: IWorkbenchLocalizationService,
    @IInstantiationService private readonly instantiationService: IInstantiationService,
  ) {
    super(Parts.WorkspacePart)
    this.settingsTabOpen = this.layoutService.page === 'settings'
  }

  protected createContentArea(parent: HTMLElement): void {
    const tabsBar = $<HTMLDivElement>('div.editor-tabs-bar', {
      role: 'tablist',
    })

    this.workspaceTabLabel = $<HTMLSpanElement>('span.editor-tab-label')
    this.workspaceTabElement = $<HTMLDivElement>(
      'div.editor-tab.editor-tab-workspace',
      {
        role: 'tab',
        tabindex: '0',
        'aria-selected': true,
      },
      renderCodicon('files', 14),
      this.workspaceTabLabel,
    )
    this._register(
      addDisposableListener(this.workspaceTabElement, 'click', () => {
        this.layoutService.setPage('home')
      }),
    )
    this._register(
      addDisposableListener(this.workspaceTabElement, 'keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          this.layoutService.setPage('home')
        } else if (event.key === 'ArrowRight' && this.settingsTabOpen) {
          event.preventDefault()
          this.settingsTabElement?.focus()
          this.layoutService.setPage('settings')
        }
      }),
    )

    this.settingsTabLabel = $<HTMLSpanElement>('span.editor-tab-label')
    this.settingsCloseButton = $<HTMLButtonElement>(
      'button.editor-tab-close',
      {
        type: 'button',
        'aria-label': this.localizationService.t('common.close'),
      },
      renderCodicon('close', 14),
    )
    this._register(
      attachTooltip(this.settingsCloseButton, () => this.localizationService.t('common.close')),
    )
    this._register(
      addDisposableListener(this.settingsCloseButton, 'click', (event) => {
        event.stopPropagation()
        this.closeSettingsTab()
      }),
    )

    this.settingsTabElement = $<HTMLDivElement>(
      'div.editor-tab.editor-tab-settings',
      {
        role: 'tab',
        tabindex: '-1',
        'aria-selected': false,
      },
      renderCodicon('settings-gear', 14),
      this.settingsTabLabel,
      this.settingsCloseButton,
    )
    this._register(
      addDisposableListener(this.settingsTabElement, 'click', () => {
        this.layoutService.setPage('settings')
      }),
    )
    this._register(
      addDisposableListener(this.settingsTabElement, 'auxclick', (event) => {
        if (event.button === 1) {
          event.preventDefault()
          this.closeSettingsTab()
        }
      }),
    )
    this._register(
      addDisposableListener(this.settingsTabElement, 'keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          this.layoutService.setPage('settings')
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault()
          this.workspaceTabElement?.focus()
          this.layoutService.setPage('home')
        }
      }),
    )

    tabsBar.appendChild(this.workspaceTabElement)
    tabsBar.appendChild(this.settingsTabElement)

    this.contentElement = $<HTMLDivElement>('div.editor-content', {
      role: 'tabpanel',
    })

    this.welcomeView = this._register(this.instantiationService.createInstance(WelcomeEditorView))
    this.contentElement.appendChild(this.welcomeView.element)

    parent.appendChild(tabsBar)
    parent.appendChild(this.contentElement)

    this.syncView()

    this._register(
      this.layoutService.onDidChangeLayout(() => {
        this.syncView()
      }),
    )
    this._register(
      this.sessionsService.onDidChangeSessions(() => {
        this.syncTabLabels()
      }),
    )
    this._register(
      this.localizationService.onDidChangeLocale(() => {
        this.syncTabLabels()
      }),
    )
  }

  private closeSettingsTab(): void {
    this.settingsTabOpen = false
    const existingSettings = this.settingsViewSlot.value
    if (existingSettings) {
      existingSettings.element.remove()
      this.settingsViewSlot.clear()
    }
    if (this.layoutService.page === 'settings') {
      this.layoutService.setPage('home')
    } else {
      this.syncView()
    }
  }

  private ensureSettingsView(): SettingsEditorView {
    let view = this.settingsViewSlot.value
    if (!view) {
      view = this.instantiationService.createInstance(SettingsEditorView)
      this.settingsViewSlot.value = view
      this.contentElement?.appendChild(view.element)
    }
    return view
  }

  private syncTabLabels(): void {
    const activeSession = this.sessionsService.currentSession
    const sessionTitle =
      !activeSession || activeSession.isDefaultTitle
        ? this.localizationService.t('sessions.newSession')
        : activeSession.title

    if (this.workspaceTabLabel) {
      this.workspaceTabLabel.textContent = sessionTitle
    }
    if (this.settingsTabLabel) {
      this.settingsTabLabel.textContent = this.localizationService.t('nav.settings')
    }
    if (this.settingsCloseButton) {
      this.settingsCloseButton.setAttribute(
        'aria-label',
        this.localizationService.t('common.close'),
      )
    }
  }

  private syncView(): void {
    const isSettings = this.layoutService.page === 'settings'
    if (isSettings) {
      this.settingsTabOpen = true
    }

    this.syncTabLabels()

    if (this.workspaceTabElement) {
      toggleClass(this.workspaceTabElement, 'active', !isSettings)
      this.workspaceTabElement.setAttribute('aria-selected', isSettings ? 'false' : 'true')
      this.workspaceTabElement.tabIndex = isSettings ? -1 : 0
    }

    if (this.settingsTabElement) {
      toggleClass(this.settingsTabElement, 'hidden', !this.settingsTabOpen)
      toggleClass(this.settingsTabElement, 'active', isSettings)
      this.settingsTabElement.setAttribute('aria-selected', isSettings ? 'true' : 'false')
      this.settingsTabElement.tabIndex = isSettings ? 0 : -1
    }

    if (this.welcomeView) {
      toggleClass(this.welcomeView.element, 'hidden', isSettings)
    }

    if (isSettings) {
      const settingsView = this.ensureSettingsView()
      toggleClass(settingsView.element, 'hidden', false)
    } else if (this.settingsViewSlot.value) {
      toggleClass(this.settingsViewSlot.value.element, 'hidden', true)
    }
  }
}
