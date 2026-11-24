import { setFullscreen } from '@app/base/browser/browser'
import { Emitter, type Event } from '@app/base/common/event'
import { Disposable } from '@app/base/common/lifecycle'
import { DEFAULT_CONFIGURATION } from '@app/platform/configuration/common/configuration'
import { InstantiationType, registerSingleton } from '@app/platform/instantiation/common/extensions'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'
import { ILogService } from '@app/platform/log/common/log'
import { INativeHostService } from '@app/platform/native/common/native'
import {
  DEFAULT_AUXILIARY_BAR_STATE,
  DEFAULT_SIDEBAR_STATE,
  DEFAULT_TERTIARY_BAR_STATE,
  SIDEBAR_LIMITS,
  type SideBarPosition,
  type SidebarState,
  TERTIARY_BAR_LIMITS,
  type ViewContainerLocation,
} from '@app/platform/window/common/window'
import { IWorkbenchConfigurationService } from '@app/workbench/services/configuration/browser/workbenchConfigurationService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { INotificationService } from '@app/workbench/services/notification/browser/notificationService'

export enum Parts {
  TitlebarPart = 'workbench.parts.titlebar',
  SidebarPart = 'workbench.parts.sidebar',
  AuxiliaryBarPart = 'workbench.parts.auxiliarybar',
  TertiaryBarPart = 'workbench.parts.tertiarybar',
  WorkspacePart = 'workbench.parts.workspace',
  SettingsPart = 'workbench.parts.settings',
  StatusbarPart = 'workbench.parts.statusbar',
  NotificationsPart = 'workbench.parts.notifications',
}

export type WorkbenchPage = 'home' | 'settings'

export interface ViewLayoutState {
  readonly viewLocations: Readonly<Record<string, ViewContainerLocation>>
  readonly activePrimaryViewId?: string | undefined
  readonly activeAuxiliaryViewId?: string | undefined
  readonly activeTertiaryViewId?: string | undefined
}

export interface IWorkbenchLayoutService {
  readonly _serviceBrand: undefined
  readonly page: WorkbenchPage
  readonly settingsSection: string
  readonly sidebarOpen: boolean
  readonly sidebarWidth: number
  readonly auxiliaryBarOpen: boolean
  readonly auxiliaryBarWidth: number
  readonly tertiaryBarOpen: boolean
  readonly tertiaryBarHeight: number
  readonly sideBarPosition: SideBarPosition
  readonly statusBarVisible: boolean
  readonly compactMode: boolean
  readonly maximized: boolean
  readonly fullScreen: boolean
  readonly initialized: boolean
  readonly initializationError: boolean
  readonly viewLocations: Readonly<Record<string, ViewContainerLocation>>
  readonly activePrimaryViewId: string | undefined
  readonly activeAuxiliaryViewId: string | undefined
  readonly activeTertiaryViewId: string | undefined
  readonly onDidChangeLayout: Event<void>
  initialize(): Promise<void>
  setPage(page: WorkbenchPage): void
  toggleSettings(): void
  openSettings(section?: string): void
  setSettingsSection(section: string): void
  setSidebarOpen(open: boolean): void
  toggleSidebar(): void
  setSidebarWidth(width: number, persist?: boolean): void
  setAuxiliaryBarOpen(open: boolean): void
  toggleAuxiliaryBar(): void
  setAuxiliaryBarWidth(width: number, persist?: boolean): void
  setTertiaryBarOpen(open: boolean): void
  toggleTertiaryBar(): void
  setTertiaryBarHeight(height: number, persist?: boolean): void
  setSideBarPosition(position: SideBarPosition): Promise<void>
  toggleSideBarPosition(): Promise<void>
  setStatusBarVisible(visible: boolean): Promise<void>
  toggleStatusBarVisible(): Promise<void>
  setCompactMode(compact: boolean): void
  toggleCompactMode(): void
  setMaximized(maximized: boolean): void
  setFullScreen(fullScreen: boolean): void
  toggleFullScreen(): Promise<boolean>
  setViewLayoutState(state: ViewLayoutState): void
  setInitializationError(hasError: boolean): void
  markInitialized(): void
  resetLayout(): Promise<boolean>
}

export const IWorkbenchLayoutService =
  createDecorator<IWorkbenchLayoutService>('workbenchLayoutService')

function recordsEqual(
  left: Readonly<Record<string, ViewContainerLocation>> | undefined,
  right: Readonly<Record<string, ViewContainerLocation>> | undefined,
): boolean {
  const leftKeys = left ? Object.keys(left) : []
  const rightKeys = right ? Object.keys(right) : []
  if (leftKeys.length !== rightKeys.length) {
    return false
  }
  for (const key of leftKeys) {
    if (left?.[key] !== right?.[key]) {
      return false
    }
  }
  return true
}

function sidebarStatesEqual(left: SidebarState | null, right: SidebarState): boolean {
  return (
    left !== null &&
    left.open === right.open &&
    left.width === right.width &&
    left.compact === right.compact &&
    (left.auxiliaryOpen ?? false) === (right.auxiliaryOpen ?? false) &&
    (left.auxiliaryWidth ?? DEFAULT_AUXILIARY_BAR_STATE.width) ===
      (right.auxiliaryWidth ?? DEFAULT_AUXILIARY_BAR_STATE.width) &&
    (left.tertiaryOpen ?? false) === (right.tertiaryOpen ?? false) &&
    (left.tertiaryHeight ?? DEFAULT_TERTIARY_BAR_STATE.height) ===
      (right.tertiaryHeight ?? DEFAULT_TERTIARY_BAR_STATE.height) &&
    left.activePrimaryViewId === right.activePrimaryViewId &&
    left.activeAuxiliaryViewId === right.activeAuxiliaryViewId &&
    left.activeTertiaryViewId === right.activeTertiaryViewId &&
    recordsEqual(left.viewLocations, right.viewLocations)
  )
}

export class WorkbenchLayoutService extends Disposable implements IWorkbenchLayoutService {
  declare readonly _serviceBrand: undefined

  private readonly _onDidChangeLayout = this._register(new Emitter<void>())
  readonly onDidChangeLayout: Event<void> = this._onDidChangeLayout.event

  private _page: WorkbenchPage = 'home'
  private _settingsSection = 'general'
  private _sidebarOpen: boolean = DEFAULT_SIDEBAR_STATE.open
  private _sidebarWidth: number = DEFAULT_SIDEBAR_STATE.width
  private _auxiliaryBarOpen: boolean = DEFAULT_AUXILIARY_BAR_STATE.open
  private _auxiliaryBarWidth: number = DEFAULT_AUXILIARY_BAR_STATE.width
  private _tertiaryBarOpen: boolean = DEFAULT_TERTIARY_BAR_STATE.open
  private _tertiaryBarHeight: number = DEFAULT_TERTIARY_BAR_STATE.height
  private _compactMode: boolean = DEFAULT_SIDEBAR_STATE.compact
  private _maximized = false
  private _fullScreen = false
  private _initialized = false
  private _initializationError = false
  private _viewLocations: Record<string, ViewContainerLocation> = {}
  private _activePrimaryViewId: string | undefined
  private _activeAuxiliaryViewId: string | undefined
  private _activeTertiaryViewId: string | undefined
  private lastPersistedSidebar: SidebarState | null = null

  constructor(
    @INativeHostService private readonly nativeHostService: INativeHostService,
    @IWorkbenchConfigurationService
    private readonly configurationService: IWorkbenchConfigurationService,
    @ILogService private readonly logService: ILogService,
    @INotificationService private readonly notificationService: INotificationService,
    @IWorkbenchLocalizationService
    private readonly localizationService: IWorkbenchLocalizationService,
  ) {
    super()

    this._register(
      this.configurationService.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration('sideBarLocation') ||
          event.affectsConfiguration('statusBarVisible')
        ) {
          this._onDidChangeLayout.fire()
        }
      }),
    )
  }

  get page(): WorkbenchPage {
    return this._page
  }

  get settingsSection(): string {
    return this._settingsSection
  }

  get sidebarOpen(): boolean {
    return this._sidebarOpen
  }

  get sidebarWidth(): number {
    return this._sidebarWidth
  }

  get auxiliaryBarOpen(): boolean {
    return this._auxiliaryBarOpen
  }

  get auxiliaryBarWidth(): number {
    return this._auxiliaryBarWidth
  }

  get tertiaryBarOpen(): boolean {
    return this._tertiaryBarOpen
  }

  get tertiaryBarHeight(): number {
    return this._tertiaryBarHeight
  }

  get sideBarPosition(): SideBarPosition {
    return this.configurationService.getValue('sideBarLocation')
  }

  get statusBarVisible(): boolean {
    return this.configurationService.getValue('statusBarVisible')
  }

  get compactMode(): boolean {
    return this._compactMode
  }

  get maximized(): boolean {
    return this._maximized
  }

  get fullScreen(): boolean {
    return this._fullScreen
  }

  get initialized(): boolean {
    return this._initialized
  }

  get initializationError(): boolean {
    return this._initializationError
  }

  get viewLocations(): Readonly<Record<string, ViewContainerLocation>> {
    return this._viewLocations
  }

  get activePrimaryViewId(): string | undefined {
    return this._activePrimaryViewId
  }

  get activeAuxiliaryViewId(): string | undefined {
    return this._activeAuxiliaryViewId
  }

  get activeTertiaryViewId(): string | undefined {
    return this._activeTertiaryViewId
  }

  async initialize(): Promise<void> {
    const [sidebar, maximized, fullScreen] = await Promise.all([
      this.nativeHostService.getSidebarState(),
      this.nativeHostService.isWindowMaximized(),
      typeof this.nativeHostService.isFullScreen === 'function'
        ? this.nativeHostService.isFullScreen()
        : Promise.resolve(false),
    ])
    if (sidebar) {
      this._sidebarOpen = sidebar.open
      this._sidebarWidth = Math.max(SIDEBAR_LIMITS.min, Math.round(sidebar.width))
      this._compactMode = sidebar.compact
      this._auxiliaryBarOpen = sidebar.auxiliaryOpen ?? DEFAULT_AUXILIARY_BAR_STATE.open
      this._auxiliaryBarWidth = Math.max(
        SIDEBAR_LIMITS.min,
        Math.round(sidebar.auxiliaryWidth ?? DEFAULT_AUXILIARY_BAR_STATE.width),
      )
      this._tertiaryBarOpen = sidebar.tertiaryOpen ?? DEFAULT_TERTIARY_BAR_STATE.open
      this._tertiaryBarHeight = Math.max(
        TERTIARY_BAR_LIMITS.min,
        Math.round(sidebar.tertiaryHeight ?? DEFAULT_TERTIARY_BAR_STATE.height),
      )
      this._viewLocations = sidebar.viewLocations ? { ...sidebar.viewLocations } : {}
      this._activePrimaryViewId = sidebar.activePrimaryViewId
      this._activeAuxiliaryViewId = sidebar.activeAuxiliaryViewId
      this._activeTertiaryViewId = sidebar.activeTertiaryViewId
      this.lastPersistedSidebar = this.buildSidebarStateSnapshot()
    }
    this._maximized = maximized
    this._fullScreen = fullScreen
    setFullscreen(fullScreen)
    this._onDidChangeLayout.fire()
  }

  setPage(page: WorkbenchPage): void {
    let changed = false
    if (this._page !== page) {
      this._page = page
      changed = true
    }
    if (page !== 'home' && this._compactMode) {
      this._compactMode = false
      this.persistSidebarState()
      changed = true
    }
    if (changed) {
      this._onDidChangeLayout.fire()
    }
  }

  toggleSettings(): void {
    this.setPage(this._page === 'settings' ? 'home' : 'settings')
  }

  openSettings(section?: string): void {
    let changed = false
    if (section !== undefined && section.length > 0 && this._settingsSection !== section) {
      this._settingsSection = section
      changed = true
    }
    if (this._page !== 'settings') {
      this._page = 'settings'
      changed = true
    }
    if (this._compactMode) {
      this._compactMode = false
      this.persistSidebarState()
      changed = true
    }
    if (changed) {
      this._onDidChangeLayout.fire()
    }
  }

  setSettingsSection(section: string): void {
    if (this._settingsSection === section) {
      return
    }
    this._settingsSection = section
    this._onDidChangeLayout.fire()
  }

  setSidebarOpen(open: boolean): void {
    if (this._sidebarOpen === open) {
      return
    }
    this._sidebarOpen = open
    this.persistSidebarState()
    this._onDidChangeLayout.fire()
  }

  toggleSidebar(): void {
    this.setSidebarOpen(!this._sidebarOpen)
  }

  setSidebarWidth(width: number, persist = true): void {
    if (!Number.isFinite(width)) {
      return
    }
    const normalized = Math.max(SIDEBAR_LIMITS.min, Math.round(width))
    const changed = this._sidebarWidth !== normalized
    if (changed) {
      this._sidebarWidth = normalized
    }
    if (persist) {
      this.persistSidebarState()
    }
    if (changed) {
      this._onDidChangeLayout.fire()
    }
  }

  setAuxiliaryBarOpen(open: boolean): void {
    if (this._auxiliaryBarOpen === open) {
      return
    }
    this._auxiliaryBarOpen = open
    this.persistSidebarState()
    this._onDidChangeLayout.fire()
  }

  toggleAuxiliaryBar(): void {
    this.setAuxiliaryBarOpen(!this._auxiliaryBarOpen)
  }

  setAuxiliaryBarWidth(width: number, persist = true): void {
    if (!Number.isFinite(width)) {
      return
    }
    const normalized = Math.max(SIDEBAR_LIMITS.min, Math.round(width))
    const changed = this._auxiliaryBarWidth !== normalized
    if (changed) {
      this._auxiliaryBarWidth = normalized
    }
    if (persist) {
      this.persistSidebarState()
    }
    if (changed) {
      this._onDidChangeLayout.fire()
    }
  }

  setTertiaryBarOpen(open: boolean): void {
    if (this._tertiaryBarOpen === open) {
      return
    }
    this._tertiaryBarOpen = open
    this.persistSidebarState()
    this._onDidChangeLayout.fire()
  }

  toggleTertiaryBar(): void {
    this.setTertiaryBarOpen(!this._tertiaryBarOpen)
  }

  setTertiaryBarHeight(height: number, persist = true): void {
    if (!Number.isFinite(height)) {
      return
    }
    const normalized = Math.max(TERTIARY_BAR_LIMITS.min, Math.round(height))
    const changed = this._tertiaryBarHeight !== normalized
    if (changed) {
      this._tertiaryBarHeight = normalized
    }
    if (persist) {
      this.persistSidebarState()
    }
    if (changed) {
      this._onDidChangeLayout.fire()
    }
  }

  async setSideBarPosition(position: SideBarPosition): Promise<void> {
    if (this.sideBarPosition === position) {
      return
    }
    await this.configurationService.updateConfiguration({ sideBarLocation: position })
  }

  async toggleSideBarPosition(): Promise<void> {
    const next: SideBarPosition = this.sideBarPosition === 'left' ? 'right' : 'left'
    await this.setSideBarPosition(next)
  }

  async setStatusBarVisible(visible: boolean): Promise<void> {
    if (this.statusBarVisible === visible) {
      return
    }
    await this.configurationService.updateConfiguration({ statusBarVisible: visible })
  }

  async toggleStatusBarVisible(): Promise<void> {
    await this.setStatusBarVisible(!this.statusBarVisible)
  }

  setCompactMode(compact: boolean): void {
    if (this._compactMode === compact) {
      return
    }
    this._compactMode = compact
    this.persistSidebarState()
    this._onDidChangeLayout.fire()
  }

  toggleCompactMode(): void {
    this.setCompactMode(!this._compactMode)
  }

  setMaximized(maximized: boolean): void {
    if (this._maximized === maximized) {
      return
    }
    this._maximized = maximized
    this._onDidChangeLayout.fire()
  }

  setFullScreen(fullScreen: boolean): void {
    if (this._fullScreen === fullScreen) {
      return
    }
    this._fullScreen = fullScreen
    setFullscreen(fullScreen)
    this._onDidChangeLayout.fire()
  }

  async toggleFullScreen(): Promise<boolean> {
    try {
      const next = await this.nativeHostService.toggleFullScreen()
      this.setFullScreen(next)
      return next
    } catch (error) {
      this.logService.warn(
        'WorkbenchLayoutService',
        'Fullscreen state could not be toggled.',
        error,
      )
      return this._fullScreen
    }
  }

  setViewLayoutState(state: ViewLayoutState): void {
    const locationsChanged = !recordsEqual(this._viewLocations, state.viewLocations)
    const primaryChanged = this._activePrimaryViewId !== state.activePrimaryViewId
    const auxChanged = this._activeAuxiliaryViewId !== state.activeAuxiliaryViewId
    const tertiaryChanged = this._activeTertiaryViewId !== state.activeTertiaryViewId
    if (!locationsChanged && !primaryChanged && !auxChanged && !tertiaryChanged) {
      return
    }
    this._viewLocations = { ...state.viewLocations }
    this._activePrimaryViewId = state.activePrimaryViewId
    this._activeAuxiliaryViewId = state.activeAuxiliaryViewId
    this._activeTertiaryViewId = state.activeTertiaryViewId
    this.persistSidebarState()
    this._onDidChangeLayout.fire()
  }

  setInitializationError(hasError: boolean): void {
    if (this._initializationError === hasError) {
      return
    }
    this._initializationError = hasError
    this._onDidChangeLayout.fire()
  }

  markInitialized(): void {
    if (this._initialized && !this._initializationError) {
      return
    }
    this._initialized = true
    this._initializationError = false
    this._onDidChangeLayout.fire()
  }

  async resetLayout(): Promise<boolean> {
    try {
      const sidebar = await this.nativeHostService.resetWindowLayout()
      this._sidebarOpen = sidebar.open
      this._sidebarWidth = sidebar.width
      this._auxiliaryBarOpen = sidebar.auxiliaryOpen ?? DEFAULT_AUXILIARY_BAR_STATE.open
      this._auxiliaryBarWidth = sidebar.auxiliaryWidth ?? DEFAULT_AUXILIARY_BAR_STATE.width
      this._tertiaryBarOpen = sidebar.tertiaryOpen ?? DEFAULT_TERTIARY_BAR_STATE.open
      this._tertiaryBarHeight = sidebar.tertiaryHeight ?? DEFAULT_TERTIARY_BAR_STATE.height
      this._compactMode = sidebar.compact
      this._viewLocations = {}
      this._activePrimaryViewId = undefined
      this._activeAuxiliaryViewId = undefined
      this._activeTertiaryViewId = undefined
      this.lastPersistedSidebar = this.buildSidebarStateSnapshot()

      if (
        this.sideBarPosition !== DEFAULT_CONFIGURATION.sideBarLocation ||
        this.statusBarVisible !== DEFAULT_CONFIGURATION.statusBarVisible
      ) {
        await this.configurationService.updateConfiguration({
          sideBarLocation: DEFAULT_CONFIGURATION.sideBarLocation,
          statusBarVisible: DEFAULT_CONFIGURATION.statusBarVisible,
        })
      }

      this._onDidChangeLayout.fire()
      return true
    } catch (error) {
      this.logService.error('WorkbenchLayoutService', 'Window layout could not be reset.', error)
      this.notificationService.error(this.localizationService.t('errors.generic'))
      return false
    }
  }

  private buildSidebarStateSnapshot(): SidebarState {
    return {
      open: this._sidebarOpen,
      width: this._sidebarWidth,
      compact: this._compactMode,
      auxiliaryOpen: this._auxiliaryBarOpen,
      auxiliaryWidth: this._auxiliaryBarWidth,
      tertiaryOpen: this._tertiaryBarOpen,
      tertiaryHeight: this._tertiaryBarHeight,
      viewLocations: { ...this._viewLocations },
      activePrimaryViewId: this._activePrimaryViewId,
      activeAuxiliaryViewId: this._activeAuxiliaryViewId,
      activeTertiaryViewId: this._activeTertiaryViewId,
    }
  }

  private persistSidebarState(): void {
    if (this.isDisposed) {
      return
    }
    const nextState = this.buildSidebarStateSnapshot()
    if (sidebarStatesEqual(this.lastPersistedSidebar, nextState)) {
      return
    }
    this.lastPersistedSidebar = nextState
    void this.nativeHostService.setSidebarState(nextState).catch((error: unknown) => {
      this.logService.warn(
        'WorkbenchLayoutService',
        'Session sidebar state could not be persisted.',
        error,
      )
    })
  }
}

registerSingleton(IWorkbenchLayoutService, WorkbenchLayoutService, InstantiationType.Eager)
