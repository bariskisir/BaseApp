import { IContextMenuService } from '@app/workbench/services/contextmenu/browser/contextMenuService'
import {
  IWorkbenchLayoutService,
  Parts,
} from '@app/workbench/services/layout/browser/layoutService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { IViewDescriptorService } from '@app/workbench/services/views/browser/viewDescriptorService'
import { AbstractSidebarPart } from './abstractSidebarPart'

export class SidebarPart extends AbstractSidebarPart {
  protected readonly partClassName = 'sidebar'

  constructor(
    @IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
    @IViewDescriptorService viewDescriptorService: IViewDescriptorService,
    @IWorkbenchLocalizationService localizationService: IWorkbenchLocalizationService,
    @IContextMenuService contextMenuService: IContextMenuService,
  ) {
    super(
      Parts.SidebarPart,
      'sidebar',
      layoutService,
      viewDescriptorService,
      localizationService,
      contextMenuService,
    )
  }
}
