import type {
  AppConfiguration,
  TrayIconPreset,
} from '@app/platform/configuration/common/configuration'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'
import type { AppLocale } from '@app/platform/localization/common/localization'

export type TrayConfiguration = Pick<AppConfiguration, 'showTrayIcon' | 'minimizeToTrayOnClose'> & {
  trayIcon?: TrayIconPreset
  uiLanguage?: AppLocale
}

export interface ITrayMainService {
  readonly _serviceBrand: undefined
  applyConfiguration(config: TrayConfiguration): void
  shouldMinimizeOnClose(): boolean
  prepareToQuit(): void
  dispose(): void
}

export const ITrayMainService = createDecorator<ITrayMainService>('trayMainService')
