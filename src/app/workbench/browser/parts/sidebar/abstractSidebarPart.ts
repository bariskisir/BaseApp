import './sidebarPart.scss'
import { CODICON_NAMES, type CodiconName, renderCodicon } from '@app/base/browser/codicons'
import { $, addDisposableListener, clearNode, toggleClass } from '@app/base/browser/dom'
import {
  ActionBar,
  type ActionBarItem,
  Button,
  type ContextMenuItem,
  Sash,
} from '@app/base/browser/ui'
import { DisposableStore, MutableDisposable } from '@app/base/common/lifecycle'
import {
  VIEW_CONTAINER_LOCATIONS,
  type ViewContainerLocation,
  clampSidebarWidth,
  clampTertiaryBarHeight,
} from '@app/platform/window/common/window'
import { Part } from '@app/workbench/browser/part'
import { type IViewPane, VIEW_DRAG_MIME_TYPE } from '@app/workbench/browser/viewPane'
import type { IViewDescriptor } from '@app/workbench/common/views'
import type { IContextMenuService } from '@app/workbench/services/contextmenu/browser/contextMenuService'
import type {
  IWorkbenchLayoutService,
  Parts,
} from '@app/workbench/services/layout/browser/layoutService'
import type { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import type { IViewDescriptorService } from '@app/workbench/services/views/browser/viewDescriptorService'

const VALID_CODICONS = new Set<string>(CODICON_NAMES)

function toCodiconName(iconId: string): CodiconName {
  return VALID_CODICONS.has(iconId) ? (iconId as CodiconName) : 'window'
}

export abstract class AbstractSidebarPart extends Part {
  private readonly headerDisposables = this._register(new DisposableStore())
  private readonly bodyDisposables = this._register(new DisposableStore())
  private readonly activePaneActionsListener = this._register(new MutableDisposable())

  private headerElement: HTMLElement | undefined
  private titleSlot: HTMLDivElement | undefined
  private headerActionBar: ActionBar | undefined
  private bodyContainer: HTMLDivElement | undefined
  private dropOverlay: HTMLDivElement | undefined
  private sash: Sash | undefined
  private dragStartSize = 0
  private dragEnterDepth = 0
  private activePane: IViewPane | undefined

  constructor(
    id: Parts,
    protected readonly location: ViewContainerLocation,
    protected readonly layoutService: IWorkbenchLayoutService,
    protected readonly viewDescriptorService: IViewDescriptorService,
    protected readonly localizationService: IWorkbenchLocalizationService,
    protected readonly contextMenuService: IContextMenuService,
  ) {
    super(id)
  }

  protected get isHorizontal(): boolean {
    return this.location === 'tertiarybar'
  }

  protected get otherLocations(): readonly ViewContainerLocation[] {
    return VIEW_CONTAINER_LOCATIONS.filter((candidate) => candidate !== this.location)
  }

  protected isVisuallyOnLeft(): boolean {
    const primaryLeft = this.layoutService.sideBarPosition === 'left'
    return this.location === 'sidebar' ? primaryLeft : !primaryLeft
  }

  protected isOpen(): boolean {
    if (this.location === 'sidebar') {
      return this.layoutService.sidebarOpen
    }
    if (this.location === 'auxiliarybar') {
      return this.layoutService.auxiliaryBarOpen
    }
    return this.layoutService.tertiaryBarOpen
  }

  protected setOpen(open: boolean): void {
    if (this.location === 'sidebar') {
      this.layoutService.setSidebarOpen(open)
    } else if (this.location === 'auxiliarybar') {
      this.layoutService.setAuxiliaryBarOpen(open)
    } else {
      this.layoutService.setTertiaryBarOpen(open)
    }
  }

  protected getSize(): number {
    if (this.location === 'sidebar') {
      return this.layoutService.sidebarWidth
    }
    if (this.location === 'auxiliarybar') {
      return this.layoutService.auxiliaryBarWidth
    }
    return this.layoutService.tertiaryBarHeight
  }

  protected setSize(size: number, persist: boolean): void {
    if (this.location === 'sidebar') {
      this.layoutService.setSidebarWidth(size, persist)
    } else if (this.location === 'auxiliarybar') {
      this.layoutService.setAuxiliaryBarWidth(size, persist)
    } else {
      this.layoutService.setTertiaryBarHeight(size, persist)
    }
  }

  protected getOtherSidebarVisibleWidth(): number {
    if (this.isHorizontal || this.layoutService.compactMode) {
      return 0
    }
    if (this.location === 'sidebar') {
      return this.layoutService.auxiliaryBarOpen ? this.layoutService.auxiliaryBarWidth : 0
    }
    return this.layoutService.sidebarOpen ? this.layoutService.sidebarWidth : 0
  }

  protected createContentArea(parent: HTMLElement): void {
    this.titleSlot = $<HTMLDivElement>('div.sidebar-title-slot')
    const headerActions = $<HTMLDivElement>('div.sidebar-header-actions')
    this.headerElement = $<HTMLElement>(
      'header.sidebar-header',
      undefined,
      this.titleSlot,
      headerActions,
    )

    this.headerActionBar = this._register(
      new ActionBar(headerActions, { orientation: 'horizontal', iconSize: 16 }),
    )

    this._register(
      addDisposableListener(this.headerElement, 'contextmenu', (event) => {
        event.preventDefault()
        event.stopPropagation()
        this.showHeaderContextMenu(event.clientX, event.clientY)
      }),
    )

    this.bodyContainer = $<HTMLDivElement>('div.sidebar-body')
    this.dropOverlay = $<HTMLDivElement>('div.sidebar-drop-overlay.hidden')

    parent.appendChild(this.headerElement)
    parent.appendChild(this.bodyContainer)
    parent.appendChild(this.dropOverlay)

    this.setupDragAndDrop(parent)
    this.setupSash(parent)

    this._register(this.layoutService.onDidChangeLayout(() => this.syncLayout()))
    this._register(this.viewDescriptorService.onDidChangeLocation(() => this.renderViews()))
    this._register(
      this.localizationService.onDidChangeLocale(() => {
        this.renderViews()
        this.syncLayout()
      }),
    )

    this.renderViews()
    this.syncLayout()
  }

  private clampSizeForViewport(size: number): number {
    if (this.isHorizontal) {
      const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 760
      return clampTertiaryBarHeight(size, viewportHeight)
    }
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1180
    return clampSidebarWidth(size, viewportWidth, this.getOtherSidebarVisibleWidth())
  }

  private getResizeDirection(): 1 | -1 {
    if (this.isHorizontal) {
      return -1
    }
    return this.isVisuallyOnLeft() ? 1 : -1
  }

  private setupSash(parent: HTMLElement): void {
    this.sash = this._register(
      new Sash(parent, {
        orientation: this.isHorizontal ? 'horizontal' : 'vertical',
        ariaLabel: this.getSidebarLabel(),
      }),
    )
    this._register(
      this.sash.onDidStart(() => {
        this.dragStartSize = this.getSize()
      }),
    )
    this._register(
      this.sash.onDidChange((delta) => {
        const nextSize = this.clampSizeForViewport(
          this.dragStartSize + delta * this.getResizeDirection(),
        )
        this.setSize(nextSize, false)
      }),
    )
    this._register(
      this.sash.onDidEnd(() => {
        this.setSize(this.getSize(), true)
      }),
    )
    this._register(
      this.sash.onDidKeyStep((step) => {
        const nextSize = this.clampSizeForViewport(
          this.getSize() + step * this.getResizeDirection(),
        )
        this.setSize(nextSize, true)
      }),
    )

    if (typeof window !== 'undefined') {
      this._register(
        addDisposableListener(window, 'resize', () => {
          const currentSize = this.getSize()
          const clamped = this.clampSizeForViewport(currentSize)
          if (clamped !== currentSize) {
            this.setSize(clamped, true)
          }
        }),
      )
    }
  }

  private setupDragAndDrop(target: HTMLElement): void {
    const hasViewPayload = (event: DragEvent): boolean => {
      const types = event.dataTransfer?.types
      return !!types && Array.from(types).includes(VIEW_DRAG_MIME_TYPE)
    }

    this._register(
      addDisposableListener(target, 'dragenter', (event) => {
        if (!hasViewPayload(event)) {
          return
        }
        event.preventDefault()
        this.dragEnterDepth += 1
        this.setDropHighlight(true)
      }),
    )

    this._register(
      addDisposableListener(target, 'dragover', (event) => {
        if (!hasViewPayload(event)) {
          return
        }
        event.preventDefault()
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'move'
        }
        this.setDropHighlight(true)
      }),
    )

    this._register(
      addDisposableListener(target, 'dragleave', () => {
        if (this.dragEnterDepth > 0) {
          this.dragEnterDepth -= 1
        }
        if (this.dragEnterDepth === 0) {
          this.setDropHighlight(false)
        }
      }),
    )

    this._register(
      addDisposableListener(target, 'drop', (event) => {
        this.dragEnterDepth = 0
        this.setDropHighlight(false)
        const viewId = event.dataTransfer?.getData(VIEW_DRAG_MIME_TYPE)
        if (!viewId) {
          return
        }
        event.preventDefault()
        this.viewDescriptorService.moveViewToLocation(viewId, this.location)
      }),
    )
  }

  private setDropHighlight(active: boolean): void {
    if (this.dropOverlay) {
      toggleClass(this.dropOverlay, 'hidden', !active)
    }
    if (this._element) {
      toggleClass(this._element, 'drag-over', active)
    }
  }

  private getSidebarLabel(location: ViewContainerLocation = this.location): string {
    if (location === 'sidebar') {
      return this.localizationService.t('sidebar.primarySideBar')
    }
    if (location === 'auxiliarybar') {
      return this.localizationService.t('sidebar.secondarySideBar')
    }
    return this.localizationService.t('sidebar.tertiarySideBar')
  }

  private getMoveToLocationLabel(location: ViewContainerLocation): string {
    if (location === 'sidebar') {
      return this.localizationService.t('sidebar.moveToPrimarySideBar')
    }
    if (location === 'auxiliarybar') {
      return this.localizationService.t('sidebar.moveToSecondarySideBar')
    }
    return this.localizationService.t('sidebar.moveToTertiarySideBar')
  }

  private getHideSidebarLabel(location: ViewContainerLocation = this.location): string {
    if (location === 'sidebar') {
      return this.localizationService.t('sidebar.hidePrimarySideBar')
    }
    if (location === 'auxiliarybar') {
      return this.localizationService.t('sidebar.hideSecondarySideBar')
    }
    return this.localizationService.t('sidebar.hideTertiarySideBar')
  }

  private getLocationIcon(location: ViewContainerLocation): CodiconName {
    if (location === 'tertiarybar') {
      return 'panel-bottom'
    }
    const primaryLeft = this.layoutService.sideBarPosition === 'left'
    if (location === 'sidebar') {
      return primaryLeft ? 'layout-sidebar-left' : 'layout-sidebar-right'
    }
    return primaryLeft ? 'layout-sidebar-right' : 'layout-sidebar-left'
  }

  private buildMoveViewMenuItems(viewId: string): ContextMenuItem[] {
    return this.otherLocations.map((targetLocation) => ({
      id: `move-view-to-${targetLocation}`,
      icon: this.getLocationIcon(targetLocation),
      label: this.getMoveToLocationLabel(targetLocation),
      run: () => {
        this.viewDescriptorService.moveViewToLocation(viewId, targetLocation)
      },
    }))
  }

  private syncLayout(): void {
    const visible = this.isOpen() && !this.layoutService.compactMode
    const clampedSize = this.clampSizeForViewport(this.getSize())

    if (this._element) {
      toggleClass(this._element, 'hidden', !visible)
      if (this.isHorizontal) {
        toggleClass(this._element, 'sidebar-edge-left', false)
        toggleClass(this._element, 'sidebar-edge-right', false)
        toggleClass(this._element, 'sidebar-edge-bottom', true)
        this._element.style.height = `${clampedSize}px`
      } else {
        const onLeft = this.isVisuallyOnLeft()
        toggleClass(this._element, 'sidebar-edge-left', onLeft)
        toggleClass(this._element, 'sidebar-edge-right', !onLeft)
        toggleClass(this._element, 'sidebar-edge-bottom', false)
        this._element.style.width = `${clampedSize}px`
      }
      this._element.setAttribute('aria-hidden', visible ? 'false' : 'true')
    }

    if (this.sash) {
      this.sash.setEnabled(visible)
      this.sash.setAriaValueNow(clampedSize)
      this.sash.element.setAttribute('aria-label', this.getSidebarLabel())
    }
  }

  private renderViews(): void {
    if (!this.titleSlot || !this.bodyContainer) {
      return
    }

    this.headerDisposables.clear()
    this.bodyDisposables.clear()
    this.activePaneActionsListener.clear()
    this.activePane = undefined

    clearNode(this.titleSlot)
    clearNode(this.bodyContainer)

    const views = this.viewDescriptorService.getViewsByLocation(this.location)
    const activeViewId = this.viewDescriptorService.getActiveViewId(this.location)
    const activeDescriptor = views.find((view) => view.id === activeViewId) ?? views[0]

    if (!activeDescriptor) {
      this.titleSlot.appendChild(
        $<HTMLSpanElement>('span.sidebar-title', undefined, this.getSidebarLabel()),
      )
      this.renderEmptyState(this.bodyContainer)
      this.syncHeaderActions(undefined)
      return
    }

    if (views.length === 1) {
      const titleElement = $<HTMLSpanElement>(
        'span.sidebar-title.sidebar-draggable-view',
        {
          draggable: activeDescriptor.canMoveView !== false ? 'true' : undefined,
        },
        this.localizationService.t(activeDescriptor.titleKey),
      )
      this.attachViewDragStart(titleElement, activeDescriptor)
      this.titleSlot.appendChild(titleElement)
    } else {
      const tabList = $<HTMLDivElement>('div.sidebar-view-tabs', { role: 'tablist' })
      for (const view of views) {
        const isActive = view.id === activeDescriptor.id
        const tabButton = $<HTMLButtonElement>(
          'button.sidebar-view-tab',
          {
            type: 'button',
            role: 'tab',
            'aria-selected': isActive ? 'true' : 'false',
            draggable: view.canMoveView !== false ? 'true' : undefined,
          },
          renderCodicon(toCodiconName(view.iconId), 14),
          $<HTMLSpanElement>(
            'span.sidebar-view-tab-label',
            undefined,
            this.localizationService.t(view.titleKey),
          ),
        )
        toggleClass(tabButton, 'active', isActive)
        this.headerDisposables.add(
          addDisposableListener(tabButton, 'click', () => {
            this.viewDescriptorService.setActiveViewId(this.location, view.id)
          }),
        )
        this.attachViewDragStart(tabButton, view)
        tabList.appendChild(tabButton)
      }
      this.titleSlot.appendChild(tabList)
    }

    const pane = this.viewDescriptorService.getOrCreateViewPane(activeDescriptor.id)
    if (pane) {
      this.activePane = pane
      this.bodyContainer.appendChild(pane.element)
      this.activePaneActionsListener.value = pane.onDidChangeHeaderActions(() => {
        this.syncHeaderActions(activeDescriptor)
      })
    }

    this.syncHeaderActions(activeDescriptor)
  }

  private renderEmptyState(container: HTMLElement): void {
    const t = (key: string): string => this.localizationService.t(key)
    const emptyIcon: CodiconName = this.isHorizontal
      ? 'panel-bottom-off'
      : this.isVisuallyOnLeft()
        ? 'layout-sidebar-left-off'
        : 'layout-sidebar-right-off'

    const emptyBox = $<HTMLDivElement>(
      'div.sidebar-empty',
      undefined,
      renderCodicon(emptyIcon, this.isHorizontal ? 18 : 24),
      $<HTMLSpanElement>('span.sidebar-empty-hint', undefined, t('sidebar.emptyHint')),
    )

    const movableViews = this.otherLocations.flatMap((otherLocation) =>
      this.viewDescriptorService
        .getViewsByLocation(otherLocation)
        .filter((view) => view.canMoveView !== false),
    )

    if (movableViews.length > 0) {
      const actionsRow = $<HTMLDivElement>('div.sidebar-empty-actions')
      const moveHereLabel = this.getMoveToLocationLabel(this.location)
      for (const view of movableViews) {
        const moveButton = this.bodyDisposables.add(
          new Button(actionsRow, {
            icon: 'arrow-swap',
            label: `${t(view.titleKey)} — ${moveHereLabel}`,
            variant: 'secondary',
            small: true,
          }),
        )
        this.bodyDisposables.add(
          moveButton.onDidClick(() => {
            this.viewDescriptorService.moveViewToLocation(view.id, this.location)
          }),
        )
      }
      emptyBox.appendChild(actionsRow)
    }

    container.appendChild(emptyBox)
  }

  private attachViewDragStart(element: HTMLElement, descriptor: IViewDescriptor): void {
    if (descriptor.canMoveView === false) {
      return
    }
    this.headerDisposables.add(
      addDisposableListener(element, 'dragstart', (event) => {
        if (!event.dataTransfer) {
          return
        }
        event.dataTransfer.setData(VIEW_DRAG_MIME_TYPE, descriptor.id)
        event.dataTransfer.effectAllowed = 'move'
      }),
    )
  }

  private syncHeaderActions(activeDescriptor: IViewDescriptor | undefined): void {
    if (!this.headerActionBar) {
      return
    }
    const t = (key: string): string => this.localizationService.t(key)
    const items: ActionBarItem[] = []

    if (this.activePane) {
      items.push(...this.activePane.getHeaderActions())
    }

    if (activeDescriptor && activeDescriptor.canMoveView !== false) {
      const moveLabel = t('sidebar.moveView')
      items.push({
        id: 'sidebar-move-view',
        icon: 'arrow-swap',
        title: moveLabel,
        ariaLabel: moveLabel,
        run: (anchor) => {
          const rect =
            anchor?.getBoundingClientRect() ?? this.headerElement?.getBoundingClientRect()
          const position = rect ? { x: rect.left, y: rect.bottom + 4 } : { x: 0, y: 0 }
          this.contextMenuService.showContextMenu(
            position,
            this.buildMoveViewMenuItems(activeDescriptor.id),
          )
        },
      })
    }

    if (this.location !== 'sidebar') {
      const hideLabel = this.getHideSidebarLabel()
      items.push({
        id: `sidebar-close-${this.location}`,
        icon: 'close',
        title: hideLabel,
        ariaLabel: hideLabel,
        run: () => {
          this.setOpen(false)
        },
      })
    }

    this.headerActionBar.setItems(items)
  }

  private showHeaderContextMenu(x: number, y: number): void {
    const t = (key: string): string => this.localizationService.t(key)
    const activeViewId = this.viewDescriptorService.getActiveViewId(this.location)
    const activeDescriptor = activeViewId
      ? this.viewDescriptorService
          .getViewsByLocation(this.location)
          .find((view) => view.id === activeViewId)
      : undefined
    const items: ContextMenuItem[] = []

    if (activeDescriptor && activeDescriptor.canMoveView !== false) {
      items.push(...this.buildMoveViewMenuItems(activeDescriptor.id))
      items.push({ type: 'separator' })
    }

    const isPrimaryLeft = this.layoutService.sideBarPosition === 'left'
    items.push({
      id: 'context-move-primary-position',
      icon: isPrimaryLeft ? 'layout-sidebar-right' : 'layout-sidebar-left',
      label: t(
        isPrimaryLeft ? 'sidebar.movePrimarySideBarRight' : 'sidebar.movePrimarySideBarLeft',
      ),
      run: () => {
        void this.layoutService.toggleSideBarPosition()
      },
    })

    items.push({
      id: 'context-reset-locations',
      icon: 'discard',
      label: t('sidebar.resetViewLocations'),
      run: () => {
        this.viewDescriptorService.resetViewLocations()
      },
    })

    items.push({ type: 'separator' })
    items.push({
      id: 'context-hide-sidebar',
      icon: 'close',
      label: this.getHideSidebarLabel(),
      run: () => {
        this.setOpen(false)
      },
    })

    this.contextMenuService.showContextMenu({ x, y }, items)
  }
}
