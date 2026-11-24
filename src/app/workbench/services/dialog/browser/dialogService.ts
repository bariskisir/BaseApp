import {
  type ConfirmDialogOptions,
  type PromptDialogOptions,
  showConfirmDialog,
  showPromptDialog,
} from '@app/base/browser/ui'
import { Disposable } from '@app/base/common/lifecycle'
import { InstantiationType, registerSingleton } from '@app/platform/instantiation/common/extensions'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'

export interface IDialogService {
  readonly _serviceBrand: undefined
  confirm(options: ConfirmDialogOptions): Promise<boolean>
  prompt(options: PromptDialogOptions): Promise<string | null>
}

export const IDialogService = createDecorator<IDialogService>('dialogService')

export class DialogService extends Disposable implements IDialogService {
  declare readonly _serviceBrand: undefined

  confirm(options: ConfirmDialogOptions): Promise<boolean> {
    return showConfirmDialog(options)
  }

  prompt(options: PromptDialogOptions): Promise<string | null> {
    return showPromptDialog(options)
  }
}

registerSingleton(IDialogService, DialogService, InstantiationType.Eager)
