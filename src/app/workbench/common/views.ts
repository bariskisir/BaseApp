import { Emitter, type Event } from '@app/base/common/event'
import { Disposable, type IDisposable, toDisposable } from '@app/base/common/lifecycle'
import { Registry } from '@app/platform/registry/common/platform'
import type { ViewContainerLocation } from '@app/platform/window/common/window'

export type { ViewContainerLocation }

export interface IViewDescriptor<TFactory = unknown> {
  readonly id: string
  readonly titleKey: string
  readonly iconId: string
  readonly order: number
  readonly defaultLocation: ViewContainerLocation
  readonly canMoveView?: boolean | undefined
  readonly factory: () => TFactory
}

export const ViewsExtensions = {
  Views: 'baseapp.workbench.views',
} as const

export interface IViewsRegistry {
  readonly onDidChangeViews: Event<void>
  registerView(descriptor: IViewDescriptor): IDisposable
  getViews(): readonly IViewDescriptor[]
  getView(id: string): IViewDescriptor | undefined
  clearForTest(): void
}

export class ViewsRegistry extends Disposable implements IViewsRegistry {
  private readonly _onDidChangeViews = this._register(new Emitter<void>())
  readonly onDidChangeViews: Event<void> = this._onDidChangeViews.event
  private readonly views = new Map<string, IViewDescriptor>()

  registerView(descriptor: IViewDescriptor): IDisposable {
    if (!descriptor.id || descriptor.id.trim().length === 0) {
      throw new Error('View descriptor id must be a non-empty string')
    }
    this.views.set(descriptor.id, descriptor)
    this._onDidChangeViews.fire()

    return toDisposable(() => {
      if (this.views.get(descriptor.id) === descriptor) {
        this.views.delete(descriptor.id)
        this._onDidChangeViews.fire()
      }
    })
  }

  getViews(): readonly IViewDescriptor[] {
    return Array.from(this.views.values()).sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order
      }
      return left.id.localeCompare(right.id)
    })
  }

  getView(id: string): IViewDescriptor | undefined {
    return this.views.get(id)
  }

  clearForTest(): void {
    if (this.views.size === 0) {
      return
    }
    this.views.clear()
    this._onDidChangeViews.fire()
  }
}

const viewsRegistry = new ViewsRegistry()
Registry.add(ViewsExtensions.Views, viewsRegistry)

export function getViewsRegistry(): IViewsRegistry {
  return Registry.knows(ViewsExtensions.Views)
    ? Registry.as<IViewsRegistry>(ViewsExtensions.Views)
    : viewsRegistry
}

export function registerView(descriptor: IViewDescriptor): IDisposable {
  return getViewsRegistry().registerView(descriptor)
}
