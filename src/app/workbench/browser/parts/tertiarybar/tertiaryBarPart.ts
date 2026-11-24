import { IContextMenuService } from '@app/workbench/services/contextmenu/browser/contextMenuService'
import {
  IWorkbenchLayoutService,
  Parts,
} from '@app/workbench/services/layout/browser/layoutService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { IViewDescriptorService } from '@app/workbench/services/views/browser/viewDescriptorService'
import { AbstractSidebarPart } from '../sidebar/abstractSidebarPart'

export class TertiaryBarPart extends AbstractSidebarPart {
  protected readonly partClassName = 'tertiarybar'

  constructor(
    @IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
    @IViewDescriptorService viewDescriptorService: IViewDescriptorService,
    @IWorkbenchLocalizationService localizationService: IWorkbenchLocalizationService,
    @IContextMenuService contextMenuService: IContextMenuService,
  ) {
    super(
      Parts.TertiaryBarPart,
      'tertiarybar',
      layoutService,
      viewDescriptorService,
      localizationService,
      contextMenuService,
    )
  }
}
