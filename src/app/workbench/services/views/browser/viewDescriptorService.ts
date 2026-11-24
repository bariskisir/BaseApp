import { Emitter, type Event } from '@app/base/common/event'
import { Disposable } from '@app/base/common/lifecycle'
import { InstantiationType, registerSingleton } from '@app/platform/instantiation/common/extensions'
import {
  IInstantiationService,
  createDecorator,
} from '@app/platform/instantiation/common/instantiation'
import type { IViewPane, ViewPaneFactory } from '@app/workbench/browser/viewPane'
import {
  type IViewDescriptor,
  type ViewContainerLocation,
  getViewsRegistry,
} from '@app/workbench/common/views'
import { IWorkbenchLayoutService } from '@app/workbench/services/layout/browser/layoutService'

export interface IViewDescriptorService {
  readonly _serviceBrand: undefined
  readonly onDidChangeLocation: Event<void>
  getViewsByLocation(location: ViewContainerLocation): readonly IViewDescriptor[]
  getViewLocation(viewId: string): ViewContainerLocation | undefined
  getActiveViewId(location: ViewContainerLocation): string | undefined
  setActiveViewId(location: ViewContainerLocation, viewId: string): void
  moveViewToLocation(viewId: string, targetLocation: ViewContainerLocation): boolean
  resetViewLocations(): void
  getOrCreateViewPane(viewId: string): IViewPane | undefined
  openView(viewId: string): void
}

export const IViewDescriptorService =
  createDecorator<IViewDescriptorService>('viewDescriptorService')

export class ViewDescriptorService extends Disposable implements IViewDescriptorService {
  declare readonly _serviceBrand: undefined

  private readonly _onDidChangeLocation = this._register(new Emitter<void>())
  readonly onDidChangeLocation: Event<void> = this._onDidChangeLocation.event

  private readonly locationOverrides = new Map<string, ViewContainerLocation>()
  private readonly activeViewIds = new Map<ViewContainerLocation, string>()
  private readonly viewPanes = new Map<string, IViewPane>()
  private isMutatingLayout = false

  constructor(
    @IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
    @IInstantiationService private readonly instantiationService: IInstantiationService,
  ) {
    super()

    this.syncFromLayoutService()

    this._register(
      this.layoutService.onDidChangeLayout(() => {
        if (this.isMutatingLayout) {
          return
        }
        if (this.syncFromLayoutService()) {
          this._onDidChangeLocation.fire()
        }
      }),
    )

    this._register(
      getViewsRegistry().onDidChangeViews(() => {
        this.pruneRemovedViews()
        this._onDidChangeLocation.fire()
      }),
    )
  }

  getViewsByLocation(location: ViewContainerLocation): readonly IViewDescriptor[] {
    return getViewsRegistry()
      .getViews()
      .filter((descriptor) => this.resolveLocation(descriptor) === location)
  }

  getViewLocation(viewId: string): ViewContainerLocation | undefined {
    const descriptor = getViewsRegistry().getView(viewId)
    if (!descriptor) {
      return undefined
    }
    return this.resolveLocation(descriptor)
  }

  getActiveViewId(location: ViewContainerLocation): string | undefined {
    const views = this.getViewsByLocation(location)
    if (views.length === 0) {
      return undefined
    }
    const stored = this.activeViewIds.get(location)
    if (stored && views.some((view) => view.id === stored)) {
      return stored
    }
    return views[0]?.id
  }

  setActiveViewId(location: ViewContainerLocation, viewId: string): void {
    const views = this.getViewsByLocation(location)
    if (!views.some((view) => view.id === viewId)) {
      return
    }
    if (this.activeViewIds.get(location) === viewId) {
      return
    }
    this.activeViewIds.set(location, viewId)
    this.runLayoutMutation(() => {
      this.persistViewState()
    })
    this._onDidChangeLocation.fire()
  }

  moveViewToLocation(viewId: string, targetLocation: ViewContainerLocation): boolean {
    const descriptor = getViewsRegistry().getView(viewId)
    if (!descriptor || descriptor.canMoveView === false) {
      return false
    }

    const currentLocation = this.resolveLocation(descriptor)
    if (currentLocation === targetLocation) {
      this.runLayoutMutation(() => {
        this.openLocation(targetLocation, viewId)
        this.persistViewState()
      })
      return false
    }

    if (targetLocation === descriptor.defaultLocation) {
      this.locationOverrides.delete(viewId)
    } else {
      this.locationOverrides.set(viewId, targetLocation)
    }

    this.activeViewIds.set(targetLocation, viewId)

    const remainingInSource = this.getViewsByLocation(currentLocation)
    this.runLayoutMutation(() => {
      if (remainingInSource.length === 0) {
        this.activeViewIds.delete(currentLocation)
        this.setLocationOpen(currentLocation, false)
      } else if (this.activeViewIds.get(currentLocation) === viewId) {
        const fallback = remainingInSource[0]
        if (fallback) {
          this.activeViewIds.set(currentLocation, fallback.id)
        }
      }

      this.openLocation(targetLocation, viewId)
      this.persistViewState()
    })

    this._onDidChangeLocation.fire()
    return true
  }

  resetViewLocations(): void {
    if (this.locationOverrides.size === 0) {
      return
    }
    this.locationOverrides.clear()
    this.activeViewIds.clear()
    this.runLayoutMutation(() => {
      this.persistViewState()
    })
    this._onDidChangeLocation.fire()
  }

  getOrCreateViewPane(viewId: string): IViewPane | undefined {
    const existing = this.viewPanes.get(viewId)
    if (existing) {
      return existing
    }
    const descriptor = getViewsRegistry().getView(viewId)
    if (!descriptor) {
      return undefined
    }
    const factory = descriptor.factory() as ViewPaneFactory
    const pane = this.instantiationService.invokeFunction((accessor) => factory(accessor))
    this.viewPanes.set(viewId, pane)
    return pane
  }

  openView(viewId: string): void {
    const location = this.getViewLocation(viewId)
    if (!location) {
      return
    }
    this.runLayoutMutation(() => {
      this.openLocation(location, viewId)
      this.persistViewState()
    })
    this._onDidChangeLocation.fire()
  }

  private runLayoutMutation(work: () => void): void {
    this.isMutatingLayout = true
    try {
      work()
    } finally {
      this.isMutatingLayout = false
    }
  }

  override dispose(): void {
    for (const pane of this.viewPanes.values()) {
      pane.dispose()
    }
    this.viewPanes.clear()
    super.dispose()
  }

  private setLocationOpen(location: ViewContainerLocation, open: boolean): void {
    if (location === 'sidebar') {
      this.layoutService.setSidebarOpen(open)
    } else if (location === 'auxiliarybar') {
      this.layoutService.setAuxiliaryBarOpen(open)
    } else {
      this.layoutService.setTertiaryBarOpen(open)
    }
  }

  private openLocation(location: ViewContainerLocation, viewId: string): void {
    this.activeViewIds.set(location, viewId)
    if (this.layoutService.compactMode) {
      this.layoutService.setCompactMode(false)
    }
    this.setLocationOpen(location, true)
  }

  private resolveLocation(descriptor: IViewDescriptor): ViewContainerLocation {
    return this.locationOverrides.get(descriptor.id) ?? descriptor.defaultLocation
  }

  private syncFromLayoutService(): boolean {
    const nextLocations = this.layoutService.viewLocations
    const nextPrimary = this.layoutService.activePrimaryViewId
    const nextAuxiliary = this.layoutService.activeAuxiliaryViewId
    const nextTertiary = this.layoutService.activeTertiaryViewId

    let changed = false
    const nextEntries = Object.entries(nextLocations)
    if (this.locationOverrides.size !== nextEntries.length) {
      changed = true
    } else {
      for (const [id, location] of nextEntries) {
        if (this.locationOverrides.get(id) !== location) {
          changed = true
          break
        }
      }
    }

    if (changed) {
      this.locationOverrides.clear()
      for (const [id, location] of nextEntries) {
        this.locationOverrides.set(id, location)
      }
    }

    if (this.activeViewIds.get('sidebar') !== nextPrimary) {
      if (nextPrimary) {
        this.activeViewIds.set('sidebar', nextPrimary)
      } else {
        this.activeViewIds.delete('sidebar')
      }
      changed = true
    }

    if (this.activeViewIds.get('auxiliarybar') !== nextAuxiliary) {
      if (nextAuxiliary) {
        this.activeViewIds.set('auxiliarybar', nextAuxiliary)
      } else {
        this.activeViewIds.delete('auxiliarybar')
      }
      changed = true
    }

    if (this.activeViewIds.get('tertiarybar') !== nextTertiary) {
      if (nextTertiary) {
        this.activeViewIds.set('tertiarybar', nextTertiary)
      } else {
        this.activeViewIds.delete('tertiarybar')
      }
      changed = true
    }

    return changed
  }

  private persistViewState(): void {
    const viewLocations: Record<string, ViewContainerLocation> = {}
    for (const [id, location] of this.locationOverrides) {
      viewLocations[id] = location
    }
    this.layoutService.setViewLayoutState({
      viewLocations,
      activePrimaryViewId: this.activeViewIds.get('sidebar'),
      activeAuxiliaryViewId: this.activeViewIds.get('auxiliarybar'),
      activeTertiaryViewId: this.activeViewIds.get('tertiarybar'),
    })
  }

  private pruneRemovedViews(): void {
    const registry = getViewsRegistry()
    for (const [id, pane] of this.viewPanes) {
      if (!registry.getView(id)) {
        pane.dispose()
        this.viewPanes.delete(id)
      }
    }
  }
}

registerSingleton(IViewDescriptorService, ViewDescriptorService, InstantiationType.Eager)
