import { IContextMenuService } from '@app/workbench/services/contextmenu/browser/contextMenuService'
import {
  IWorkbenchLayoutService,
  Parts,
} from '@app/workbench/services/layout/browser/layoutService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { IViewDescriptorService } from '@app/workbench/services/views/browser/viewDescriptorService'
import { AbstractSidebarPart } from '../sidebar/abstractSidebarPart'

export class AuxiliaryBarPart extends AbstractSidebarPart {
  protected readonly partClassName = 'auxiliarybar'

  constructor(
    @IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
    @IViewDescriptorService viewDescriptorService: IViewDescriptorService,
    @IWorkbenchLocalizationService localizationService: IWorkbenchLocalizationService,
    @IContextMenuService contextMenuService: IContextMenuService,
  ) {
    super(
      Parts.AuxiliaryBarPart,
      'auxiliarybar',
      layoutService,
      viewDescriptorService,
      localizationService,
      contextMenuService,
    )
  }
}
