import {
  type ContextMenuAnchor,
  type ContextMenuItem,
  hideActiveContextMenu,
  showContextMenu,
} from '@app/base/browser/ui'
import { Disposable, type IDisposable } from '@app/base/common/lifecycle'
import { InstantiationType, registerSingleton } from '@app/platform/instantiation/common/extensions'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'

export interface IContextMenuService {
  readonly _serviceBrand: undefined
  showContextMenu(anchor: ContextMenuAnchor, items: readonly ContextMenuItem[]): IDisposable
}

export const IContextMenuService = createDecorator<IContextMenuService>('contextMenuService')

export class ContextMenuService extends Disposable implements IContextMenuService {
  declare readonly _serviceBrand: undefined

  showContextMenu(anchor: ContextMenuAnchor, items: readonly ContextMenuItem[]): IDisposable {
    return showContextMenu(anchor, items)
  }

  override dispose(): void {
    hideActiveContextMenu()
    super.dispose()
  }
}

registerSingleton(IContextMenuService, ContextMenuService, InstantiationType.Eager)
