import { type AppLocale, DEFAULT_APP_LOCALE } from '../localization'
import de from './de'
import en from './en'
import es from './es'
import fr from './fr'
import ja from './ja'
import ko from './ko'
import type { LocaleResource } from './localeFactory'
import pt from './pt'
import ru from './ru'
import tr from './tr'
import zh from './zh'

export { type LocaleResource, TRAY_MENU_KEYS, type TrayMenuKey } from './localeFactory'

export const LOCALE_RESOURCES: Record<AppLocale, LocaleResource> = {
  en,
  tr,
  de,
  fr,
  pt,
  zh,
  es,
  ru,
  ja,
  ko,
}

export const getLocaleResource = (locale: AppLocale): LocaleResource =>
  LOCALE_RESOURCES[locale] ?? LOCALE_RESOURCES[DEFAULT_APP_LOCALE]
