import type { ActionBarItem } from '@app/base/browser/ui'
import type { Event } from '@app/base/common/event'
import type { IDisposable } from '@app/base/common/lifecycle'
import type { ServicesAccessor } from '@app/platform/instantiation/common/instantiation'

export const VIEW_DRAG_MIME_TYPE = 'application/x-baseapp-view-id'

export interface IViewPane extends IDisposable {
  readonly id: string
  readonly element: HTMLElement
  readonly onDidChangeHeaderActions: Event<void>
  getHeaderActions(): readonly ActionBarItem[]
  focus?(): void
}

export type ViewPaneFactory = (accessor: ServicesAccessor) => IViewPane
