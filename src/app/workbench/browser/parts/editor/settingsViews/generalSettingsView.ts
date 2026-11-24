import { $ } from '@app/base/browser/dom'
import { Checkbox, SelectBox } from '@app/base/browser/ui'
import { DisposableStore } from '@app/base/common/lifecycle'
import {
  DATE_FORMATS,
  DEFAULT_CONFIGURATION,
  type DateFormat,
  TIME_FORMATS,
  type TimeFormat,
} from '@app/platform/configuration/common/configuration'
import type { ServicesAccessor } from '@app/platform/instantiation/common/instantiation'
import { APP_LOCALES, type AppLocale } from '@app/platform/localization/common/localization'
import { IWorkbenchConfigurationService } from '@app/workbench/services/configuration/browser/workbenchConfigurationService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { type SettingsViewInstance, createSettingItem, createSettingsGroup } from './types'

export function createGeneralSettingsView(accessor: ServicesAccessor): SettingsViewInstance {
  const configurationService = accessor.get(IWorkbenchConfigurationService)
  const localizationService = accessor.get(IWorkbenchLocalizationService)
  const t = (key: string, options?: Record<string, unknown>): string =>
    localizationService.t(key, options)

  const store = new DisposableStore()
  const root = $<HTMLDivElement>('div.settings-view-container')
  const categoryLabel = t('settings.general')
  const modifiedTooltip = t('settings.modified')
  const resetTooltip = t('settings.resetSetting')

  const localeOptions = APP_LOCALES.map((locale) => ({
    value: locale,
    label: t(`locales.${locale}`),
  }))
  const dateFormatOptions = DATE_FORMATS.map((format) => ({
    value: format,
    label: t(`settings.dateFormats.${format}`),
  }))
  const timeFormatOptions = TIME_FORMATS.map((format) => ({
    value: format,
    label: t(`settings.timeFormats.${format}`),
  }))

  const languageGroup = createSettingsGroup(t('settings.languageAndRegion'))

  const languageRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.interfaceLanguage'),
      description: t('settings.interfaceLanguageDescription'),
      keywords: localeOptions.map((option) => option.label),
      isModified: configurationService.getValue('uiLanguage') !== DEFAULT_CONFIGURATION.uiLanguage,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        void configurationService
          .updateConfiguration({ uiLanguage: DEFAULT_CONFIGURATION.uiLanguage })
          .catch(() => undefined)
      },
    },
    store,
  )
  const languageSelect = store.add(
    new SelectBox<AppLocale>(languageRow.controlContainer, {
      options: localeOptions,
      value: configurationService.getValue('uiLanguage'),
      ariaLabel: t('settings.interfaceLanguage'),
    }),
  )
  store.add(
    languageSelect.onDidChange((nextLanguage) => {
      void configurationService
        .updateConfiguration({ uiLanguage: nextLanguage })
        .catch(() => undefined)
    }),
  )
  languageGroup.itemsContainer.appendChild(languageRow.element)

  const dateFormatRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.dateFormat'),
      description: t('settings.dateFormatDescription'),
      keywords: dateFormatOptions.map((option) => option.label),
      isModified: configurationService.getValue('dateFormat') !== DEFAULT_CONFIGURATION.dateFormat,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        void configurationService
          .updateConfiguration({ dateFormat: DEFAULT_CONFIGURATION.dateFormat })
          .catch(() => undefined)
      },
    },
    store,
  )
  const dateFormatSelect = store.add(
    new SelectBox<DateFormat>(dateFormatRow.controlContainer, {
      options: dateFormatOptions,
      value: configurationService.getValue('dateFormat'),
      ariaLabel: t('settings.dateFormat'),
    }),
  )
  store.add(
    dateFormatSelect.onDidChange((nextDateFormat) => {
      void configurationService
        .updateConfiguration({ dateFormat: nextDateFormat })
        .catch(() => undefined)
    }),
  )
  languageGroup.itemsContainer.appendChild(dateFormatRow.element)

  const timeFormatRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.timeFormat'),
      description: t('settings.timeFormatDescription'),
      keywords: timeFormatOptions.map((option) => option.label),
      isModified: configurationService.getValue('timeFormat') !== DEFAULT_CONFIGURATION.timeFormat,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        void configurationService
          .updateConfiguration({ timeFormat: DEFAULT_CONFIGURATION.timeFormat })
          .catch(() => undefined)
      },
    },
    store,
  )
  const timeFormatSelect = store.add(
    new SelectBox<TimeFormat>(timeFormatRow.controlContainer, {
      options: timeFormatOptions,
      value: configurationService.getValue('timeFormat'),
      ariaLabel: t('settings.timeFormat'),
    }),
  )
  store.add(
    timeFormatSelect.onDidChange((nextTimeFormat) => {
      void configurationService
        .updateConfiguration({ timeFormat: nextTimeFormat })
        .catch(() => undefined)
    }),
  )
  languageGroup.itemsContainer.appendChild(timeFormatRow.element)

  const startupGroup = createSettingsGroup(t('settings.startup'))
  const startupUnavailable = configurationService.isStartupLaunchUnavailable()

  const startupRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.launchAtStartup'),
      description: t('settings.launchAtStartupDescription'),
      layout: 'checkbox',
      isModified:
        configurationService.getValue('launchAtStartup') !== DEFAULT_CONFIGURATION.launchAtStartup,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        if (configurationService.isStartupLaunchUnavailable()) {
          return
        }
        void configurationService
          .updateConfiguration({ launchAtStartup: DEFAULT_CONFIGURATION.launchAtStartup })
          .catch(() => undefined)
      },
    },
    store,
  )
  const startupCheckbox = store.add(
    new Checkbox(startupRow.controlContainer, {
      checked: configurationService.getValue('launchAtStartup'),
      disabled: startupUnavailable,
      label: t('settings.launchAtStartupDescription'),
      ariaLabel: t('settings.launchAtStartup'),
      tooltip: startupUnavailable ? t('settings.startupUnavailable') : undefined,
    }),
  )
  store.add(
    startupCheckbox.onDidChange((nextValue) => {
      void configurationService
        .updateConfiguration({ launchAtStartup: nextValue })
        .catch(() => undefined)
    }),
  )
  startupGroup.itemsContainer.appendChild(startupRow.element)

  root.appendChild(languageGroup.element)
  root.appendChild(startupGroup.element)

  const syncFromConfig = (): void => {
    const config = configurationService.getConfiguration()
    const isStartupDisabled = configurationService.isStartupLaunchUnavailable()

    languageSelect.value = config.uiLanguage
    languageRow.setModified(config.uiLanguage !== DEFAULT_CONFIGURATION.uiLanguage)

    dateFormatSelect.value = config.dateFormat
    dateFormatRow.setModified(config.dateFormat !== DEFAULT_CONFIGURATION.dateFormat)

    timeFormatSelect.value = config.timeFormat
    timeFormatRow.setModified(config.timeFormat !== DEFAULT_CONFIGURATION.timeFormat)

    startupCheckbox.checked = config.launchAtStartup
    startupCheckbox.setDisabled(isStartupDisabled)
    startupRow.setModified(config.launchAtStartup !== DEFAULT_CONFIGURATION.launchAtStartup)
  }

  store.add(
    configurationService.onDidChangeConfiguration(() => {
      syncFromConfig()
    }),
  )

  return {
    element: root,
    groups: [
      languageGroup.toEntry([languageRow.entry, dateFormatRow.entry, timeFormatRow.entry]),
      startupGroup.toEntry([startupRow.entry]),
    ],
    dispose(): void {
      store.dispose()
    },
  }
}
