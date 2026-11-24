import { Emitter, type Event } from '@app/base/common/event'
import { Disposable } from '@app/base/common/lifecycle'
import { InstantiationType, registerSingleton } from '@app/platform/instantiation/common/extensions'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'
import {
  LOCALE_RESOURCES,
  type LocaleResource,
  getLocaleResource,
} from '@app/platform/localization/common/locales'
import {
  APP_LOCALES,
  type AppLocale,
  DEFAULT_APP_LOCALE,
  type ILocalizationService,
} from '@app/platform/localization/common/localization'
import { ILogService } from '@app/platform/log/common/log'
import { IWorkbenchConfigurationService } from '@app/workbench/services/configuration/browser/workbenchConfigurationService'
import i18n from 'i18next'

const resources = Object.fromEntries(
  APP_LOCALES.map((locale) => [locale, { translation: LOCALE_RESOURCES[locale] }]),
) as Record<AppLocale, { translation: LocaleResource }>

function resolveFallbackKey(
  resource: LocaleResource,
  key: string,
  options?: Record<string, unknown>,
): string | undefined {
  let cursor: unknown = resource
  for (const segment of key.split('.')) {
    if (typeof cursor !== 'object' || cursor === null || !(segment in cursor)) {
      return undefined
    }
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  if (typeof cursor !== 'string') {
    return undefined
  }
  if (!options) {
    return cursor
  }
  return cursor.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => {
    const value = options[name]
    return value === undefined ? '' : String(value)
  })
}

export interface IWorkbenchLocalizationService extends ILocalizationService {
  readonly i18n: typeof i18n
  initialize(): Promise<void>
  t(key: string, options?: Record<string, unknown>): string
}

export const IWorkbenchLocalizationService = createDecorator<IWorkbenchLocalizationService>(
  'workbenchLocalizationService',
)

export class WorkbenchLocalizationService
  extends Disposable
  implements IWorkbenchLocalizationService
{
  declare readonly _serviceBrand: undefined

  readonly i18n: typeof i18n = i18n

  private readonly _onDidChangeLocale = this._register(new Emitter<AppLocale>())
  readonly onDidChangeLocale: Event<AppLocale> = this._onDidChangeLocale.event

  private _locale: AppLocale

  constructor(
    @IWorkbenchConfigurationService
    private readonly configurationService: IWorkbenchConfigurationService,
    @ILogService private readonly logService: ILogService,
  ) {
    super()
    this._locale = this.configurationService.getValue('uiLanguage')

    this._register(
      this.configurationService.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('uiLanguage')) {
          void this.applyLocale(event.configuration.uiLanguage)
        }
      }),
    )
  }

  get locale(): AppLocale {
    return this._locale
  }

  async initialize(): Promise<void> {
    const targetLocale = this.configurationService.getValue('uiLanguage')
    if (!this.i18n.isInitialized) {
      await this.i18n.init({
        lng: targetLocale,
        fallbackLng: DEFAULT_APP_LOCALE,
        interpolation: { escapeValue: false },
        resources,
      })
    } else if (this.i18n.language !== targetLocale) {
      await this.i18n.changeLanguage(targetLocale)
    }

    this.syncDocumentLanguage(targetLocale)
    if (this._locale !== targetLocale) {
      this._locale = targetLocale
      this._onDidChangeLocale.fire(targetLocale)
    }
  }

  getResource(locale: AppLocale = this._locale): LocaleResource {
    return getLocaleResource(locale)
  }

  t(key: string, options?: Record<string, unknown>): string {
    if (this.i18n.isInitialized) {
      return String(options ? this.i18n.t(key, options) : this.i18n.t(key))
    }
    return (
      resolveFallbackKey(getLocaleResource(this._locale), key, options) ??
      resolveFallbackKey(getLocaleResource(DEFAULT_APP_LOCALE), key, options) ??
      key
    )
  }

  private async applyLocale(locale: AppLocale): Promise<void> {
    if (this.isDisposed) {
      return
    }
    this.syncDocumentLanguage(locale)
    if (this.i18n.isInitialized && this.i18n.language !== locale) {
      try {
        await this.i18n.changeLanguage(locale)
      } catch (error) {
        this.logService.warn(
          'WorkbenchLocalizationService',
          'Could not switch application language.',
          error,
        )
      }
    }
    if (this._locale !== locale) {
      this._locale = locale
      this._onDidChangeLocale.fire(locale)
    }
  }

  private syncDocumentLanguage(locale: AppLocale): void {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = locale
    }
  }
}

registerSingleton(
  IWorkbenchLocalizationService,
  WorkbenchLocalizationService,
  InstantiationType.Eager,
)
