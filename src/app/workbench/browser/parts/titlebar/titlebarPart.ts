import './titlebarPart.scss'
import { type CodiconName, renderCodicon, setCodicon } from '@app/base/browser/codicons'
import { $, addDisposableListener, toggleClass } from '@app/base/browser/dom'
import { type ContextMenuItem, Slider, attachTooltip } from '@app/base/browser/ui'
import { ICommandService } from '@app/platform/commands/common/commands'
import {
  type ThemeMode,
  WINDOW_OPACITY_LIMITS,
  clampWindowOpacity,
  snapWindowOpacity,
} from '@app/platform/configuration/common/configuration'
import { INativeHostService } from '@app/platform/native/common/native'
import { APP_NAME } from '@app/platform/product/common/productService'
import { APP_LOGO_URL } from '@app/workbench/browser/assets/brand'
import { Part } from '@app/workbench/browser/part'
import { WINDOW_COMMANDS } from '@app/workbench/contrib/window/browser/window.contribution'
import { IWorkbenchConfigurationService } from '@app/workbench/services/configuration/browser/workbenchConfigurationService'
import { IContextMenuService } from '@app/workbench/services/contextmenu/browser/contextMenuService'
import {
  IWorkbenchLayoutService,
  Parts,
} from '@app/workbench/services/layout/browser/layoutService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { IWorkbenchLogService } from '@app/workbench/services/log/browser/rendererLogService'
import { IWorkbenchSessionsService } from '@app/workbench/services/sessions/browser/sessionsWorkbenchService'
import { IViewDescriptorService } from '@app/workbench/services/views/browser/viewDescriptorService'

const OPACITY_PERCENT_LIMITS = {
  min: Math.round(WINDOW_OPACITY_LIMITS.min * 100),
  max: Math.round(WINDOW_OPACITY_LIMITS.max * 100),
  step: Math.round(WINDOW_OPACITY_LIMITS.step * 100),
} as const

function themeToIcon(theme: ThemeMode): CodiconName {
  if (theme === 'light') {
    return 'sun'
  }
  if (theme === 'dark') {
    return 'moon'
  }
  return 'device-desktop'
}

function opacityToPercent(opacity: number): number {
  return Math.round(clampWindowOpacity(opacity) * 100)
}

export class TitlebarPart extends Part {
  protected readonly partClassName = 'titlebar'

  private containerElement: HTMLDivElement | undefined
  private brandButton: HTMLButtonElement | undefined
  private compactButton: HTMLButtonElement | undefined
  private opacityWrap: HTMLDivElement | undefined
  private opacitySlider: Slider | undefined
  private titleElement: HTMLSpanElement | undefined
  private layoutControlsElement: HTMLDivElement | undefined
  private leftSidebarToggleButton: HTMLButtonElement | undefined
  private bottomSidebarToggleButton: HTMLButtonElement | undefined
  private rightSidebarToggleButton: HTMLButtonElement | undefined
  private customizeLayoutButton: HTMLButtonElement | undefined
  private navActionsElement: HTMLDivElement | undefined
  private pinButton: HTMLButtonElement | undefined
  private themeButton: HTMLButtonElement | undefined
  private settingsButton: HTMLButtonElement | undefined
  private windowControlsElement: HTMLDivElement | undefined
  private minimizeButton: HTMLButtonElement | undefined
  private maximizeButton: HTMLButtonElement | undefined
  private closeButton: HTMLButtonElement | undefined

  constructor(
    @IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
    @IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
    @IWorkbenchConfigurationService
    private readonly configurationService: IWorkbenchConfigurationService,
    @IWorkbenchSessionsService private readonly sessionsService: IWorkbenchSessionsService,
    @IWorkbenchLocalizationService
    private readonly localizationService: IWorkbenchLocalizationService,
    @ICommandService private readonly commandService: ICommandService,
    @INativeHostService private readonly nativeHostService: INativeHostService,
    @IContextMenuService private readonly contextMenuService: IContextMenuService,
    @IWorkbenchLogService private readonly logService: IWorkbenchLogService,
  ) {
    super(Parts.TitlebarPart)
  }

  protected createContentArea(parent: HTMLElement): void {
    const container = $<HTMLDivElement>('div.titlebar-container.drag-region')
    this.containerElement = container

    const left = $<HTMLDivElement>('div.titlebar-left')
    const leftButtons = $<HTMLDivElement>('div.titlebar-left-actions.no-drag')

    const logoImage = $<HTMLImageElement>('img.titlebar-brand-logo', {
      src: APP_LOGO_URL,
      alt: '',
    })
    this.brandButton = $<HTMLButtonElement>('button.titlebar-button', { type: 'button' }, logoImage)
    this._register(attachTooltip(this.brandButton, () => this.localizationService.t('app.name')))
    this._register(
      addDisposableListener(this.brandButton, 'click', () => {
        this.layoutService.setPage('home')
      }),
    )

    this.compactButton = $<HTMLButtonElement>('button.titlebar-button', { type: 'button' })
    this._register(
      attachTooltip(this.compactButton, () =>
        this.localizationService.t(
          this.layoutService.compactMode ? 'workspace.fullView' : 'workspace.compactView',
        ),
      ),
    )
    this._register(
      addDisposableListener(this.compactButton, 'click', () => {
        if (this.layoutService.page !== 'home') {
          this.layoutService.setPage('home')
          this.layoutService.setCompactMode(true)
          return
        }
        void this.commandService.executeCommand(WINDOW_COMMANDS.toggleCompactMode)
      }),
    )

    this.opacityWrap = $<HTMLDivElement>('div.titlebar-opacity-wrap.no-drag')
    this.opacitySlider = this._register(
      new Slider(this.opacityWrap, {
        min: OPACITY_PERCENT_LIMITS.min,
        max: OPACITY_PERCENT_LIMITS.max,
        step: OPACITY_PERCENT_LIMITS.step,
        value: opacityToPercent(this.configurationService.getValue('windowOpacity')),
        ariaLabel: this.localizationService.t('settings.windowOpacity'),
        formatValue: (value) => `${value}%`,
      }),
    )
    this._register(
      attachTooltip(this.opacityWrap, () => {
        const current = this.opacitySlider?.value ?? 100
        return `${this.localizationService.t('settings.windowOpacity')}: ${current}%`
      }),
    )
    this._register(
      this.opacitySlider.onDidInput((percent) => {
        void this.nativeHostService
          .setOpacity(clampWindowOpacity(percent / 100))
          .catch(() => undefined)
      }),
    )
    this._register(
      this.opacitySlider.onDidChange((percent) => {
        void this.configurationService
          .updateConfiguration({ windowOpacity: snapWindowOpacity(percent / 100) })
          .catch(() => undefined)
      }),
    )

    leftButtons.appendChild(this.brandButton)
    leftButtons.appendChild(this.compactButton)
    leftButtons.appendChild(this.opacityWrap)
    left.appendChild(leftButtons)

    this.titleElement = $<HTMLSpanElement>('span.titlebar-window-title')
    const center = $<HTMLDivElement>('div.titlebar-center', undefined, this.titleElement)

    const right = $<HTMLDivElement>('div.titlebar-right')

    this.layoutControlsElement = $<HTMLDivElement>('div.titlebar-layout-controls.no-drag')

    this.leftSidebarToggleButton = $<HTMLButtonElement>('button.titlebar-button', {
      type: 'button',
    })
    this._register(
      attachTooltip(this.leftSidebarToggleButton, () => this.getEdgeSidebarTooltip('left')),
    )
    this._register(
      addDisposableListener(this.leftSidebarToggleButton, 'click', () => {
        this.toggleEdgeSidebar('left')
      }),
    )

    this.bottomSidebarToggleButton = $<HTMLButtonElement>('button.titlebar-button', {
      type: 'button',
    })
    this._register(
      attachTooltip(this.bottomSidebarToggleButton, () => this.getTertiarySidebarTooltip()),
    )
    this._register(
      addDisposableListener(this.bottomSidebarToggleButton, 'click', () => {
        if (this.layoutService.compactMode) {
          return
        }
        void this.commandService.executeCommand(WINDOW_COMMANDS.toggleTertiaryBar)
      }),
    )

    this.rightSidebarToggleButton = $<HTMLButtonElement>('button.titlebar-button', {
      type: 'button',
    })
    this._register(
      attachTooltip(this.rightSidebarToggleButton, () => this.getEdgeSidebarTooltip('right')),
    )
    this._register(
      addDisposableListener(this.rightSidebarToggleButton, 'click', () => {
        this.toggleEdgeSidebar('right')
      }),
    )

    this.customizeLayoutButton = $<HTMLButtonElement>(
      'button.titlebar-button',
      { type: 'button' },
      renderCodicon('layout', 16),
    )
    this._register(
      attachTooltip(this.customizeLayoutButton, () =>
        this.localizationService.t('sidebar.customizeLayout'),
      ),
    )
    this._register(
      addDisposableListener(this.customizeLayoutButton, 'click', (event) => {
        event.stopPropagation()
        this.openCustomizeLayoutMenu()
      }),
    )

    this.layoutControlsElement.appendChild(this.leftSidebarToggleButton)
    this.layoutControlsElement.appendChild(this.bottomSidebarToggleButton)
    this.layoutControlsElement.appendChild(this.rightSidebarToggleButton)
    this.layoutControlsElement.appendChild(this.customizeLayoutButton)

    this.navActionsElement = $<HTMLDivElement>('div.titlebar-nav-actions.no-drag')

    this.pinButton = $<HTMLButtonElement>('button.titlebar-button', { type: 'button' })
    this._register(
      attachTooltip(this.pinButton, () => this.localizationService.t('settings.alwaysOnTop')),
    )
    this._register(
      addDisposableListener(this.pinButton, 'click', () => {
        void this.commandService.executeCommand(WINDOW_COMMANDS.toggleAlwaysOnTop)
      }),
    )

    this.themeButton = $<HTMLButtonElement>('button.titlebar-button', { type: 'button' })
    this._register(
      attachTooltip(this.themeButton, () =>
        this.localizationService.t(`themes.${this.configurationService.getValue('theme')}`),
      ),
    )
    this._register(
      addDisposableListener(this.themeButton, 'click', () => {
        void this.commandService.executeCommand(WINDOW_COMMANDS.cycleTheme)
      }),
    )

    this.settingsButton = $<HTMLButtonElement>(
      'button.titlebar-button',
      { type: 'button' },
      renderCodicon('settings-gear', 16),
    )
    this._register(
      attachTooltip(this.settingsButton, () => this.localizationService.t('nav.settings')),
    )
    this._register(
      addDisposableListener(this.settingsButton, 'click', () => {
        this.layoutService.toggleSettings()
      }),
    )

    this.navActionsElement.appendChild(this.pinButton)
    this.navActionsElement.appendChild(this.themeButton)
    this.navActionsElement.appendChild(this.settingsButton)

    this.windowControlsElement = $<HTMLDivElement>('div.window-controls-container.no-drag')

    this.minimizeButton = $<HTMLButtonElement>(
      'button.window-control-button',
      { type: 'button' },
      renderCodicon('chrome-minimize', 16),
    )
    this._register(
      attachTooltip(this.minimizeButton, () =>
        this.localizationService.t('windowControls.minimize'),
      ),
    )
    this._register(
      addDisposableListener(this.minimizeButton, 'click', () => {
        void this.nativeHostService.minimizeWindow().catch((error: unknown) => {
          this.logService.warn('TitlebarPart', 'Window could not be minimized.', error)
        })
      }),
    )

    this.maximizeButton = $<HTMLButtonElement>('button.window-control-button', { type: 'button' })
    this._register(
      attachTooltip(this.maximizeButton, () =>
        this.localizationService.t(
          this.layoutService.maximized ? 'windowControls.restore' : 'windowControls.maximize',
        ),
      ),
    )
    this._register(
      addDisposableListener(this.maximizeButton, 'click', () => {
        void this.nativeHostService
          .toggleMaximizeWindow()
          .then((maximized) => {
            this.layoutService.setMaximized(maximized)
          })
          .catch((error: unknown) => {
            this.logService.warn(
              'TitlebarPart',
              'Window maximized state could not be changed.',
              error,
            )
          })
      }),
    )

    this.closeButton = $<HTMLButtonElement>(
      'button.window-control-button.window-control-close',
      { type: 'button' },
      renderCodicon('chrome-close', 16),
    )
    this._register(
      attachTooltip(this.closeButton, () => this.localizationService.t('windowControls.close')),
    )
    this._register(
      addDisposableListener(this.closeButton, 'click', () => {
        void this.nativeHostService.closeWindow().catch((error: unknown) => {
          this.logService.warn('TitlebarPart', 'Window could not be closed.', error)
        })
      }),
    )

    this.windowControlsElement.appendChild(this.minimizeButton)
    this.windowControlsElement.appendChild(this.maximizeButton)
    this.windowControlsElement.appendChild(this.closeButton)

    right.appendChild(this.layoutControlsElement)
    right.appendChild(this.navActionsElement)
    right.appendChild(this.windowControlsElement)

    container.appendChild(left)
    container.appendChild(center)
    container.appendChild(right)
    parent.appendChild(container)

    this._register(this.layoutService.onDidChangeLayout(() => this.sync()))
    this._register(this.configurationService.onDidChangeConfiguration(() => this.sync()))
    this._register(this.sessionsService.onDidChangeSessions(() => this.sync()))
    this._register(this.localizationService.onDidChangeLocale(() => this.sync()))

    this.sync()
  }

  private isPrimaryOnEdge(edge: 'left' | 'right'): boolean {
    return this.layoutService.sideBarPosition === edge
  }

  private isEdgeSidebarVisible(edge: 'left' | 'right'): boolean {
    if (this.layoutService.compactMode) {
      return false
    }
    return this.isPrimaryOnEdge(edge)
      ? this.layoutService.sidebarOpen
      : this.layoutService.auxiliaryBarOpen
  }

  private getEdgeSidebarTooltip(edge: 'left' | 'right'): string {
    const isPrimary = this.isPrimaryOnEdge(edge)
    const visible = this.isEdgeSidebarVisible(edge)
    if (isPrimary) {
      return this.localizationService.t(
        visible ? 'sidebar.hidePrimarySideBar' : 'sidebar.showPrimarySideBar',
      )
    }
    return this.localizationService.t(
      visible ? 'sidebar.hideSecondarySideBar' : 'sidebar.showSecondarySideBar',
    )
  }

  private getTertiarySidebarTooltip(): string {
    const visible = !this.layoutService.compactMode && this.layoutService.tertiaryBarOpen
    return this.localizationService.t(
      visible ? 'sidebar.hideTertiarySideBar' : 'sidebar.showTertiarySideBar',
    )
  }

  private toggleEdgeSidebar(edge: 'left' | 'right'): void {
    if (this.layoutService.compactMode) {
      return
    }
    if (this.isPrimaryOnEdge(edge)) {
      void this.commandService.executeCommand(WINDOW_COMMANDS.toggleSidebar)
    } else {
      void this.commandService.executeCommand(WINDOW_COMMANDS.toggleAuxiliaryBar)
    }
  }

  private openCustomizeLayoutMenu(): void {
    if (!this.customizeLayoutButton) {
      return
    }
    const rect = this.customizeLayoutButton.getBoundingClientRect()
    const t = (key: string): string => this.localizationService.t(key)
    const {
      sidebarOpen,
      auxiliaryBarOpen,
      tertiaryBarOpen,
      statusBarVisible,
      sideBarPosition,
      compactMode,
    } = this.layoutService

    const items: ContextMenuItem[] = [
      {
        id: 'layout-toggle-primary',
        icon: sideBarPosition === 'left' ? 'layout-sidebar-left' : 'layout-sidebar-right',
        label: t(sidebarOpen ? 'sidebar.hidePrimarySideBar' : 'sidebar.showPrimarySideBar'),
        run: () => {
          void this.commandService.executeCommand(WINDOW_COMMANDS.toggleSidebar)
        },
      },
      {
        id: 'layout-toggle-secondary',
        icon: sideBarPosition === 'left' ? 'layout-sidebar-right' : 'layout-sidebar-left',
        label: t(
          auxiliaryBarOpen ? 'sidebar.hideSecondarySideBar' : 'sidebar.showSecondarySideBar',
        ),
        run: () => {
          void this.commandService.executeCommand(WINDOW_COMMANDS.toggleAuxiliaryBar)
        },
      },
      {
        id: 'layout-toggle-tertiary',
        icon: tertiaryBarOpen ? 'panel-bottom' : 'panel-bottom-off',
        label: t(tertiaryBarOpen ? 'sidebar.hideTertiarySideBar' : 'sidebar.showTertiarySideBar'),
        run: () => {
          void this.commandService.executeCommand(WINDOW_COMMANDS.toggleTertiaryBar)
        },
      },
      {
        id: 'layout-toggle-statusbar',
        icon: statusBarVisible ? 'check' : 'panel-bottom',
        label: t('statusBar.statusBar'),
        run: () => {
          void this.commandService.executeCommand(WINDOW_COMMANDS.toggleStatusBar)
        },
      },
      { type: 'separator' },
      {
        id: 'layout-flip-sidebar-position',
        icon: sideBarPosition === 'left' ? 'layout-sidebar-right' : 'layout-sidebar-left',
        label: t(
          sideBarPosition === 'left'
            ? 'sidebar.movePrimarySideBarRight'
            : 'sidebar.movePrimarySideBarLeft',
        ),
        run: () => {
          void this.commandService.executeCommand(WINDOW_COMMANDS.toggleSideBarPosition)
        },
      },
      {
        id: 'layout-reset-views',
        icon: 'arrow-swap',
        label: t('sidebar.resetViewLocations'),
        run: () => {
          this.viewDescriptorService.resetViewLocations()
        },
      },
      { type: 'separator' },
      {
        id: 'layout-toggle-compact',
        icon: compactMode ? 'screen-normal' : 'screen-full',
        label: t(compactMode ? 'workspace.fullView' : 'workspace.compactView'),
        run: () => {
          void this.commandService.executeCommand(WINDOW_COMMANDS.toggleCompactMode)
        },
      },
      {
        id: 'layout-toggle-fullscreen',
        icon: 'screen-full',
        label: t('sidebar.toggleFullScreen'),
        run: () => {
          void this.commandService.executeCommand(WINDOW_COMMANDS.toggleFullScreen)
        },
      },
      { type: 'separator' },
      {
        id: 'layout-reset-all',
        icon: 'discard',
        label: t('settings.resetWindowLayoutAction'),
        run: () => {
          void this.commandService.executeCommand(WINDOW_COMMANDS.resetLayout)
        },
      },
    ]

    this.contextMenuService.showContextMenu({ x: rect.left, y: rect.bottom + 4 }, items)
  }

  private sync(): void {
    const t = (key: string): string => this.localizationService.t(key)
    const { page, compactMode, maximized, tertiaryBarOpen } = this.layoutService
    const platform = this.configurationService.platform
    const alwaysOnTop = this.configurationService.getValue('alwaysOnTop')
    const theme = this.configurationService.getValue('theme')
    const windowOpacity = this.configurationService.getValue('windowOpacity')
    const isMac = platform === 'darwin'

    if (this.containerElement) {
      toggleClass(this.containerElement, 'mac-inset', isMac)
    }

    if (this.brandButton) {
      this.brandButton.setAttribute('aria-label', t('app.name'))
    }

    if (this.compactButton) {
      setCodicon(this.compactButton, compactMode ? 'screen-normal' : 'screen-full', 16)
      this.compactButton.setAttribute('aria-pressed', compactMode ? 'true' : 'false')
      this.compactButton.setAttribute(
        'aria-label',
        t(compactMode ? 'workspace.fullView' : 'workspace.compactView'),
      )
      toggleClass(this.compactButton, 'active', compactMode)
    }

    if (this.opacityWrap && this.opacitySlider) {
      toggleClass(this.opacityWrap, 'hidden', !compactMode || page !== 'home')
      this.opacitySlider.value = opacityToPercent(windowOpacity)
    }

    if (this.titleElement) {
      const windowTitle = this.resolveWindowTitle()
      this.titleElement.textContent = windowTitle
      if (typeof document !== 'undefined') {
        document.title = windowTitle
      }
    }

    if (this.layoutControlsElement) {
      toggleClass(this.layoutControlsElement, 'hidden', compactMode)
    }

    if (this.leftSidebarToggleButton) {
      const leftVisible = this.isEdgeSidebarVisible('left')
      setCodicon(
        this.leftSidebarToggleButton,
        leftVisible ? 'layout-sidebar-left' : 'layout-sidebar-left-off',
        16,
      )
      this.leftSidebarToggleButton.setAttribute('aria-pressed', leftVisible ? 'true' : 'false')
      this.leftSidebarToggleButton.setAttribute('aria-label', this.getEdgeSidebarTooltip('left'))
    }

    if (this.bottomSidebarToggleButton) {
      const bottomVisible = !compactMode && tertiaryBarOpen
      setCodicon(
        this.bottomSidebarToggleButton,
        bottomVisible ? 'panel-bottom' : 'panel-bottom-off',
        16,
      )
      this.bottomSidebarToggleButton.setAttribute('aria-pressed', bottomVisible ? 'true' : 'false')
      this.bottomSidebarToggleButton.setAttribute('aria-label', this.getTertiarySidebarTooltip())
    }

    if (this.rightSidebarToggleButton) {
      const rightVisible = this.isEdgeSidebarVisible('right')
      setCodicon(
        this.rightSidebarToggleButton,
        rightVisible ? 'layout-sidebar-right' : 'layout-sidebar-right-off',
        16,
      )
      this.rightSidebarToggleButton.setAttribute('aria-pressed', rightVisible ? 'true' : 'false')
      this.rightSidebarToggleButton.setAttribute('aria-label', this.getEdgeSidebarTooltip('right'))
    }

    if (this.customizeLayoutButton) {
      this.customizeLayoutButton.setAttribute('aria-label', t('sidebar.customizeLayout'))
    }

    if (this.navActionsElement) {
      toggleClass(this.navActionsElement, 'hidden', compactMode)
    }

    if (this.pinButton) {
      setCodicon(this.pinButton, alwaysOnTop ? 'pinned' : 'pin', 16)
      this.pinButton.setAttribute('aria-pressed', alwaysOnTop ? 'true' : 'false')
      this.pinButton.setAttribute('aria-label', t('settings.alwaysOnTop'))
      toggleClass(this.pinButton, 'active', alwaysOnTop)
    }

    if (this.themeButton) {
      setCodicon(this.themeButton, themeToIcon(theme), 16)
      this.themeButton.setAttribute('aria-label', t(`themes.${theme}`))
    }

    if (this.settingsButton) {
      const settingsActive = page === 'settings'
      this.settingsButton.setAttribute('aria-pressed', settingsActive ? 'true' : 'false')
      this.settingsButton.setAttribute('aria-label', t('nav.settings'))
      toggleClass(this.settingsButton, 'active', settingsActive)
    }

    if (this.windowControlsElement) {
      toggleClass(this.windowControlsElement, 'hidden', isMac)
    }

    if (this.minimizeButton) {
      this.minimizeButton.setAttribute('aria-label', t('windowControls.minimize'))
    }

    if (this.maximizeButton) {
      setCodicon(this.maximizeButton, maximized ? 'chrome-restore' : 'chrome-maximize', 16)
      this.maximizeButton.setAttribute(
        'aria-label',
        t(maximized ? 'windowControls.restore' : 'windowControls.maximize'),
      )
    }

    if (this.closeButton) {
      this.closeButton.setAttribute('aria-label', t('windowControls.close'))
    }
  }

  private resolveWindowTitle(): string {
    if (this.layoutService.page === 'settings') {
      return `${this.localizationService.t('settings.title')} — ${APP_NAME}`
    }
    const current = this.sessionsService.currentSession
    if (!current) {
      return APP_NAME
    }
    const title = current.isDefaultTitle
      ? this.localizationService.t('sessions.newSession')
      : current.title
    return `${title} — ${APP_NAME}`
  }
}
