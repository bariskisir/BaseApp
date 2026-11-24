import './statusbarPart.scss'
import { type CodiconName, renderCodicon, setCodicon } from '@app/base/browser/codicons'
import { $, addDisposableListener, toggleClass } from '@app/base/browser/dom'
import { type ContextMenuItem, attachTooltip } from '@app/base/browser/ui'
import { ICommandService } from '@app/platform/commands/common/commands'
import {
  DEFAULT_ZOOM_LEVEL,
  MAX_ZOOM_LEVEL,
  MIN_ZOOM_LEVEL,
  type ThemeMode,
  zoomLevelToZoomFactor,
} from '@app/platform/configuration/common/configuration'
import { Part } from '@app/workbench/browser/part'
import { SESSIONS_VIEW_ID } from '@app/workbench/contrib/sessions/browser/sessionsView'
import { WINDOW_COMMANDS } from '@app/workbench/contrib/window/browser/window.contribution'
import { IWorkbenchConfigurationService } from '@app/workbench/services/configuration/browser/workbenchConfigurationService'
import { IContextMenuService } from '@app/workbench/services/contextmenu/browser/contextMenuService'
import {
  IWorkbenchLayoutService,
  Parts,
} from '@app/workbench/services/layout/browser/layoutService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { IWorkbenchSessionsService } from '@app/workbench/services/sessions/browser/sessionsWorkbenchService'
import { IWorkbenchUpdateService } from '@app/workbench/services/update/browser/updateWorkbenchService'
import { IViewDescriptorService } from '@app/workbench/services/views/browser/viewDescriptorService'

function themeToIcon(theme: ThemeMode): CodiconName {
  if (theme === 'light') {
    return 'sun'
  }
  if (theme === 'dark') {
    return 'moon'
  }
  return 'device-desktop'
}

function formatSignedZoomLevel(level: number): string {
  return level > 0 ? `+${level}` : String(level)
}

export class StatusbarPart extends Part {
  protected readonly partClassName = 'statusbar'

  private sessionItem: HTMLButtonElement | undefined
  private sessionText: HTMLSpanElement | undefined
  private pinnedItem: HTMLButtonElement | undefined
  private pinnedText: HTMLSpanElement | undefined
  private zoomItem: HTMLButtonElement | undefined
  private zoomIcon: HTMLSpanElement | undefined
  private zoomText: HTMLSpanElement | undefined
  private updateItem: HTMLButtonElement | undefined
  private updateIcon: HTMLSpanElement | undefined
  private updateText: HTMLSpanElement | undefined
  private languageItem: HTMLButtonElement | undefined
  private languageText: HTMLSpanElement | undefined
  private themeItem: HTMLButtonElement | undefined
  private themeIcon: HTMLSpanElement | undefined
  private themeText: HTMLSpanElement | undefined

  constructor(
    @IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
    @IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
    @IWorkbenchSessionsService private readonly sessionsService: IWorkbenchSessionsService,
    @IWorkbenchConfigurationService
    private readonly configurationService: IWorkbenchConfigurationService,
    @IWorkbenchLocalizationService
    private readonly localizationService: IWorkbenchLocalizationService,
    @IWorkbenchUpdateService private readonly updateService: IWorkbenchUpdateService,
    @ICommandService private readonly commandService: ICommandService,
    @IContextMenuService private readonly contextMenuService: IContextMenuService,
  ) {
    super(Parts.StatusbarPart)
  }

  protected createContentArea(parent: HTMLElement): void {
    const leftGroup = $<HTMLDivElement>('div.statusbar-group.statusbar-group-left')
    const rightGroup = $<HTMLDivElement>('div.statusbar-group.statusbar-group-right')

    this.sessionText = $<HTMLSpanElement>('span.statusbar-item-text')
    this.sessionItem = $<HTMLButtonElement>(
      'button.statusbar-item',
      { type: 'button' },
      renderCodicon('files', 13),
      this.sessionText,
    )
    this._register(
      attachTooltip(this.sessionItem, () => this.localizationService.t('nav.sessions')),
    )
    this._register(
      addDisposableListener(this.sessionItem, 'click', () => {
        this.layoutService.setPage('home')
      }),
    )

    this.pinnedText = $<HTMLSpanElement>('span.statusbar-item-text')
    this.pinnedItem = $<HTMLButtonElement>(
      'button.statusbar-item',
      { type: 'button' },
      renderCodicon('pinned', 12),
      this.pinnedText,
    )
    this._register(
      attachTooltip(this.pinnedItem, () => this.localizationService.t('sessions.pinned')),
    )
    this._register(
      addDisposableListener(this.pinnedItem, 'click', () => {
        this.layoutService.setPage('home')
        this.viewDescriptorService.openView(SESSIONS_VIEW_ID)
      }),
    )

    leftGroup.appendChild(this.sessionItem)
    leftGroup.appendChild(this.pinnedItem)

    this.zoomIcon = renderCodicon('zoom-in', 13)
    this.zoomText = $<HTMLSpanElement>('span.statusbar-item-text')
    this.zoomItem = $<HTMLButtonElement>(
      'button.statusbar-item.statusbar-item-prominent.hidden',
      { type: 'button' },
      this.zoomIcon,
      this.zoomText,
    )
    this._register(
      attachTooltip(this.zoomItem, () => {
        const level = this.configurationService.getValue('zoomLevel')
        const percent = Math.round(zoomLevelToZoomFactor(level) * 100)
        return this.localizationService.t('statusBar.zoomLevel', {
          level: formatSignedZoomLevel(level),
          percent,
        })
      }),
    )
    this._register(
      addDisposableListener(this.zoomItem, 'click', (event) => {
        event.stopPropagation()
        this.openZoomMenu()
      }),
    )

    this.updateIcon = renderCodicon('cloud-download', 13)
    this.updateText = $<HTMLSpanElement>('span.statusbar-item-text')
    this.updateItem = $<HTMLButtonElement>(
      'button.statusbar-item.statusbar-item-update',
      { type: 'button' },
      this.updateIcon,
      this.updateText,
    )
    this._register(
      attachTooltip(this.updateItem, () => this.localizationService.t('settings.updates')),
    )
    this._register(
      addDisposableListener(this.updateItem, 'click', () => {
        this.layoutService.openSettings('updates')
      }),
    )

    this.languageText = $<HTMLSpanElement>('span.statusbar-item-text')
    this.languageItem = $<HTMLButtonElement>(
      'button.statusbar-item',
      { type: 'button' },
      renderCodicon('globe', 13),
      this.languageText,
    )
    this._register(
      attachTooltip(this.languageItem, () =>
        this.localizationService.t('settings.interfaceLanguage'),
      ),
    )
    this._register(
      addDisposableListener(this.languageItem, 'click', () => {
        this.layoutService.openSettings('general')
      }),
    )

    this.themeIcon = renderCodicon('device-desktop', 13)
    this.themeText = $<HTMLSpanElement>('span.statusbar-item-text')
    this.themeItem = $<HTMLButtonElement>(
      'button.statusbar-item',
      { type: 'button' },
      this.themeIcon,
      this.themeText,
    )
    this._register(
      attachTooltip(this.themeItem, () => this.localizationService.t('settings.theme')),
    )
    this._register(
      addDisposableListener(this.themeItem, 'click', () => {
        void this.commandService.executeCommand(WINDOW_COMMANDS.cycleTheme)
      }),
    )

    rightGroup.appendChild(this.zoomItem)
    rightGroup.appendChild(this.updateItem)
    rightGroup.appendChild(this.languageItem)
    rightGroup.appendChild(this.themeItem)

    parent.appendChild(leftGroup)
    parent.appendChild(rightGroup)

    this._register(this.layoutService.onDidChangeLayout(() => this.sync()))
    this._register(this.sessionsService.onDidChangeSessions(() => this.sync()))
    this._register(this.configurationService.onDidChangeConfiguration(() => this.sync()))
    this._register(this.localizationService.onDidChangeLocale(() => this.sync()))
    this._register(this.updateService.onDidChangeState(() => this.sync()))

    this.sync()
  }

  private openZoomMenu(): void {
    if (!this.zoomItem) {
      return
    }
    const rect = this.zoomItem.getBoundingClientRect()
    const level = this.configurationService.getValue('zoomLevel')
    const t = (key: string): string => this.localizationService.t(key)

    const items: ContextMenuItem[] = [
      {
        id: 'statusbar-zoom-in',
        icon: 'zoom-in',
        label: t('settings.zoomIn'),
        disabled: level >= MAX_ZOOM_LEVEL,
        run: () => {
          void this.commandService.executeCommand(WINDOW_COMMANDS.zoomIn)
        },
      },
      {
        id: 'statusbar-zoom-out',
        icon: 'zoom-out',
        label: t('settings.zoomOut'),
        disabled: level <= MIN_ZOOM_LEVEL,
        run: () => {
          void this.commandService.executeCommand(WINDOW_COMMANDS.zoomOut)
        },
      },
      {
        id: 'statusbar-zoom-reset',
        icon: 'discard',
        label: t('settings.resetZoom'),
        disabled: level === DEFAULT_ZOOM_LEVEL,
        run: () => {
          void this.commandService.executeCommand(WINDOW_COMMANDS.zoomReset)
        },
      },
      { type: 'separator' },
      {
        id: 'statusbar-zoom-settings',
        icon: 'settings-gear',
        label: t('settings.appearance'),
        run: () => {
          this.layoutService.openSettings('appearance')
        },
      },
    ]

    this.contextMenuService.showContextMenu({ x: rect.left, y: Math.max(8, rect.top - 140) }, items)
  }

  private sync(): void {
    const t = (key: string, options?: Record<string, unknown>): string =>
      this.localizationService.t(key, options)

    const visible = this.layoutService.statusBarVisible
    if (this._element) {
      toggleClass(this._element, 'hidden', !visible)
      this._element.setAttribute('aria-hidden', visible ? 'false' : 'true')
    }

    const currentSession = this.sessionsService.currentSession
    if (this.sessionItem && this.sessionText) {
      if (currentSession) {
        const title = currentSession.isDefaultTitle
          ? t('sessions.newSession')
          : currentSession.title
        this.sessionText.textContent = title
        this.sessionItem.setAttribute('aria-label', title)
        toggleClass(this.sessionItem, 'hidden', false)
      } else {
        toggleClass(this.sessionItem, 'hidden', true)
      }
    }

    const pinnedCount = this.sessionsService.sessions.filter((session) => session.pinned).length
    if (this.pinnedItem && this.pinnedText) {
      if (pinnedCount > 0) {
        const pinnedLabel = t('statusBar.pinnedCount', { count: pinnedCount })
        this.pinnedText.textContent = pinnedLabel
        this.pinnedItem.setAttribute('aria-label', pinnedLabel)
        toggleClass(this.pinnedItem, 'hidden', false)
      } else {
        toggleClass(this.pinnedItem, 'hidden', true)
      }
    }

    const zoomLevel = this.configurationService.getValue('zoomLevel')
    if (this.zoomItem && this.zoomIcon && this.zoomText) {
      if (zoomLevel !== DEFAULT_ZOOM_LEVEL) {
        const percent = Math.round(zoomLevelToZoomFactor(zoomLevel) * 100)
        setCodicon(this.zoomIcon, zoomLevel > DEFAULT_ZOOM_LEVEL ? 'zoom-in' : 'zoom-out', 13)
        this.zoomText.textContent = `${percent}%`
        this.zoomItem.setAttribute(
          'aria-label',
          t('statusBar.zoomLevel', { level: formatSignedZoomLevel(zoomLevel), percent }),
        )
        toggleClass(this.zoomItem, 'hidden', false)
      } else {
        toggleClass(this.zoomItem, 'hidden', true)
      }
    }

    this.syncUpdateIndicator(t)

    const uiLanguage = this.configurationService.getValue('uiLanguage')
    if (this.languageItem && this.languageText) {
      const languageLabel = t(`locales.${uiLanguage}`)
      this.languageText.textContent = languageLabel
      this.languageItem.setAttribute('aria-label', languageLabel)
    }

    const theme = this.configurationService.getValue('theme')
    if (this.themeItem && this.themeIcon && this.themeText) {
      const themeLabel = t(`themes.${theme}`)
      setCodicon(this.themeIcon, themeToIcon(theme), 13)
      this.themeText.textContent = themeLabel
      this.themeItem.setAttribute('aria-label', themeLabel)
    }
  }

  private syncUpdateIndicator(t: (key: string, options?: Record<string, unknown>) => string): void {
    if (!this.updateItem || !this.updateIcon || !this.updateText) {
      return
    }
    const update = this.updateService.state

    toggleClass(this.updateItem, 'update-available', update.state === 'available')
    toggleClass(this.updateItem, 'update-downloading', update.state === 'downloading')
    toggleClass(this.updateItem, 'update-downloaded', update.state === 'downloaded')
    toggleClass(this.updateItem, 'update-error', update.state === 'error')

    switch (update.state) {
      case 'checking': {
        const label = t('settings.checking')
        setCodicon(this.updateIcon, 'loading', 13)
        this.updateText.textContent = label
        this.updateItem.setAttribute('aria-label', label)
        toggleClass(this.updateItem, 'hidden', false)
        return
      }
      case 'available': {
        const label = t('settings.updateAvailable', { version: update.version ?? '' })
        setCodicon(this.updateIcon, 'cloud-download', 13)
        this.updateText.textContent = label
        this.updateItem.setAttribute('aria-label', label)
        toggleClass(this.updateItem, 'hidden', false)
        return
      }
      case 'downloading': {
        const label = t('settings.downloading', { percent: Math.round(update.percent ?? 0) })
        setCodicon(this.updateIcon, 'cloud-download', 13)
        this.updateText.textContent = label
        this.updateItem.setAttribute('aria-label', label)
        toggleClass(this.updateItem, 'hidden', false)
        return
      }
      case 'downloaded': {
        const label = t('settings.readyToInstall', { version: update.version ?? '' })
        setCodicon(this.updateIcon, 'pass', 13)
        this.updateText.textContent = label
        this.updateItem.setAttribute('aria-label', label)
        toggleClass(this.updateItem, 'hidden', false)
        return
      }
      case 'error': {
        const label = t('settings.updateError')
        setCodicon(this.updateIcon, 'warning', 13)
        this.updateText.textContent = label
        this.updateItem.setAttribute('aria-label', label)
        toggleClass(this.updateItem, 'hidden', false)
        return
      }
      default: {
        toggleClass(this.updateItem, 'hidden', true)
      }
    }
  }
}
