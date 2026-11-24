import type { Event } from '@app/base/common/event'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'
import type { LocaleResource } from './locales/localeFactory'

export const APP_LOCALES = ['en', 'tr', 'de', 'fr', 'pt', 'zh', 'es', 'ru', 'ja', 'ko'] as const

export type AppLocale = (typeof APP_LOCALES)[number]

export const DEFAULT_APP_LOCALE: AppLocale = 'en'

export interface ILocalizationService {
  readonly _serviceBrand: undefined
  readonly locale: AppLocale
  readonly onDidChangeLocale: Event<AppLocale>
  getResource(locale?: AppLocale): LocaleResource
}

export const ILocalizationService = createDecorator<ILocalizationService>('localizationService')
