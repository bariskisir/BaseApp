import { $ } from '@app/base/browser/dom'
import { Checkbox, SelectBox } from '@app/base/browser/ui'
import { DisposableStore } from '@app/base/common/lifecycle'
import {
  DEFAULT_CONFIGURATION,
  TRAY_ICON_PRESETS,
  type TrayIconPreset,
} from '@app/platform/configuration/common/configuration'
import type { ServicesAccessor } from '@app/platform/instantiation/common/instantiation'
import { IWorkbenchConfigurationService } from '@app/workbench/services/configuration/browser/workbenchConfigurationService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import {
  type SettingsViewInstance,
  createInlineNotice,
  createSettingItem,
  createSettingsGroup,
} from './types'

const TRAY_ICON_LABEL_KEYS: Record<
  TrayIconPreset,
  'settings.trayIconDefault' | 'settings.trayIconBluetooth' | 'settings.trayIconWeather'
> = {
  default: 'settings.trayIconDefault',
  bluetooth: 'settings.trayIconBluetooth',
  weather: 'settings.trayIconWeather',
}

export function createTraySettingsView(accessor: ServicesAccessor): SettingsViewInstance {
  const configurationService = accessor.get(IWorkbenchConfigurationService)
  const localizationService = accessor.get(IWorkbenchLocalizationService)
  const t = (key: string, options?: Record<string, unknown>): string =>
    localizationService.t(key, options)

  const store = new DisposableStore()
  const root = $<HTMLDivElement>('div.settings-view-container')
  const categoryLabel = t('settings.trayAndTaskbar')
  const modifiedTooltip = t('settings.modified')
  const resetTooltip = t('settings.resetSetting')
  const trayUnavailable = configurationService.isTrayUnavailable()
  const unavailableTooltip = trayUnavailable ? t('settings.trayUnavailable') : undefined

  const trayIconOptions = TRAY_ICON_PRESETS.map((preset) => ({
    value: preset,
    label: t(TRAY_ICON_LABEL_KEYS[preset]),
  }))

  const changeShowTrayIcon = (nextShowTrayIcon: boolean): void => {
    void configurationService
      .updateConfiguration({
        showTrayIcon: nextShowTrayIcon,
        ...(nextShowTrayIcon ? {} : { minimizeToTrayOnClose: false, startMinimized: false }),
      })
      .catch(() => undefined)
  }

  const changeMinimizeToTray = (nextMinimizeToTrayOnClose: boolean): void => {
    void configurationService
      .updateConfiguration({
        minimizeToTrayOnClose: nextMinimizeToTrayOnClose,
        ...(nextMinimizeToTrayOnClose ? { showTrayIcon: true } : {}),
      })
      .catch(() => undefined)
  }

  const changeStartMinimized = (nextStartMinimized: boolean): void => {
    void configurationService
      .updateConfiguration({
        startMinimized: nextStartMinimized,
        ...(nextStartMinimized ? { showTrayIcon: true } : {}),
      })
      .catch(() => undefined)
  }

  const trayGroup = createSettingsGroup(t('settings.systemTray'))

  const showTrayIconRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.showTrayIcon'),
      description: t('settings.showTrayIconDescription'),
      layout: 'checkbox',
      isModified:
        configurationService.getValue('showTrayIcon') !== DEFAULT_CONFIGURATION.showTrayIcon,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        if (!configurationService.isTrayUnavailable()) {
          changeShowTrayIcon(DEFAULT_CONFIGURATION.showTrayIcon)
        }
      },
    },
    store,
  )
  const showTrayIconCheckbox = store.add(
    new Checkbox(showTrayIconRow.controlContainer, {
      checked: configurationService.getValue('showTrayIcon'),
      disabled: trayUnavailable,
      label: t('settings.showTrayIconDescription'),
      ariaLabel: t('settings.showTrayIcon'),
      tooltip: unavailableTooltip,
    }),
  )
  store.add(showTrayIconCheckbox.onDidChange((nextValue) => changeShowTrayIcon(nextValue)))
  trayGroup.itemsContainer.appendChild(showTrayIconRow.element)

  const trayIconRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.trayIcon'),
      description: t('settings.trayIconDescription'),
      keywords: trayIconOptions.map((option) => option.label),
      isModified: configurationService.getValue('trayIcon') !== DEFAULT_CONFIGURATION.trayIcon,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        if (
          !configurationService.isTrayUnavailable() &&
          configurationService.getValue('showTrayIcon')
        ) {
          void configurationService
            .updateConfiguration({ trayIcon: DEFAULT_CONFIGURATION.trayIcon })
            .catch(() => undefined)
        }
      },
    },
    store,
  )
  const trayIconSelect = store.add(
    new SelectBox<TrayIconPreset>(trayIconRow.controlContainer, {
      options: trayIconOptions,
      value: configurationService.getValue('trayIcon'),
      disabled: trayUnavailable || !configurationService.getValue('showTrayIcon'),
      ariaLabel: t('settings.trayIcon'),
    }),
  )
  store.add(
    trayIconSelect.onDidChange((nextTrayIcon) => {
      void configurationService
        .updateConfiguration({ trayIcon: nextTrayIcon })
        .catch(() => undefined)
    }),
  )
  trayGroup.itemsContainer.appendChild(trayIconRow.element)

  const minimizeToTrayRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.minimizeToTrayOnClose'),
      description: t('settings.minimizeToTrayOnCloseDescription'),
      layout: 'checkbox',
      isModified:
        configurationService.getValue('minimizeToTrayOnClose') !==
        DEFAULT_CONFIGURATION.minimizeToTrayOnClose,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        if (!configurationService.isTrayUnavailable()) {
          changeMinimizeToTray(DEFAULT_CONFIGURATION.minimizeToTrayOnClose)
        }
      },
    },
    store,
  )
  const minimizeToTrayCheckbox = store.add(
    new Checkbox(minimizeToTrayRow.controlContainer, {
      checked: configurationService.getValue('minimizeToTrayOnClose'),
      disabled: trayUnavailable,
      label: t('settings.minimizeToTrayOnCloseDescription'),
      ariaLabel: t('settings.minimizeToTrayOnClose'),
      tooltip: unavailableTooltip,
    }),
  )
  store.add(minimizeToTrayCheckbox.onDidChange((nextValue) => changeMinimizeToTray(nextValue)))
  trayGroup.itemsContainer.appendChild(minimizeToTrayRow.element)

  const startMinimizedRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.startMinimized'),
      description: t('settings.startMinimizedDescription'),
      layout: 'checkbox',
      isModified:
        configurationService.getValue('startMinimized') !== DEFAULT_CONFIGURATION.startMinimized,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        if (!configurationService.isTrayUnavailable()) {
          changeStartMinimized(DEFAULT_CONFIGURATION.startMinimized)
        }
      },
    },
    store,
  )
  const startMinimizedCheckbox = store.add(
    new Checkbox(startMinimizedRow.controlContainer, {
      checked: configurationService.getValue('startMinimized'),
      disabled: trayUnavailable,
      label: t('settings.startMinimizedDescription'),
      ariaLabel: t('settings.startMinimized'),
      tooltip: unavailableTooltip,
    }),
  )
  store.add(startMinimizedCheckbox.onDidChange((nextValue) => changeStartMinimized(nextValue)))
  trayGroup.itemsContainer.appendChild(startMinimizedRow.element)

  const taskbarGroup = createSettingsGroup(t('settings.taskbar'))

  const showTaskbarRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.showTaskbar'),
      description: t('settings.showTaskbarDescription'),
      layout: 'checkbox',
      isModified:
        configurationService.getValue('showTaskbar') !== DEFAULT_CONFIGURATION.showTaskbar,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        if (!configurationService.isTrayUnavailable()) {
          void configurationService
            .updateConfiguration({ showTaskbar: DEFAULT_CONFIGURATION.showTaskbar })
            .catch(() => undefined)
        }
      },
    },
    store,
  )
  const showTaskbarCheckbox = store.add(
    new Checkbox(showTaskbarRow.controlContainer, {
      checked: configurationService.getValue('showTaskbar'),
      disabled: trayUnavailable,
      label: t('settings.showTaskbarDescription'),
      ariaLabel: t('settings.showTaskbar'),
      tooltip: unavailableTooltip,
    }),
  )
  store.add(
    showTaskbarCheckbox.onDidChange((nextShowTaskbar) => {
      void configurationService
        .updateConfiguration({ showTaskbar: nextShowTaskbar })
        .catch(() => undefined)
    }),
  )
  taskbarGroup.itemsContainer.appendChild(showTaskbarRow.element)

  const hiddenFromShellNotice = createInlineNotice(
    'warning',
    t('settings.hiddenFromShellWarning'),
    'warning',
    undefined,
    store,
  )
  taskbarGroup.itemsContainer.appendChild(hiddenFromShellNotice.element)

  root.appendChild(trayGroup.element)
  root.appendChild(taskbarGroup.element)

  const syncFromConfig = (): void => {
    const config = configurationService.getConfiguration()
    const isUnavailable = configurationService.isTrayUnavailable()

    showTrayIconCheckbox.checked = config.showTrayIcon
    showTrayIconCheckbox.setDisabled(isUnavailable)
    showTrayIconRow.setModified(config.showTrayIcon !== DEFAULT_CONFIGURATION.showTrayIcon)

    trayIconSelect.value = config.trayIcon
    trayIconSelect.setDisabled(isUnavailable || !config.showTrayIcon)
    trayIconRow.setModified(config.trayIcon !== DEFAULT_CONFIGURATION.trayIcon)

    minimizeToTrayCheckbox.checked = config.minimizeToTrayOnClose
    minimizeToTrayCheckbox.setDisabled(isUnavailable)
    minimizeToTrayRow.setModified(
      config.minimizeToTrayOnClose !== DEFAULT_CONFIGURATION.minimizeToTrayOnClose,
    )

    startMinimizedCheckbox.checked = config.startMinimized
    startMinimizedCheckbox.setDisabled(isUnavailable)
    startMinimizedRow.setModified(config.startMinimized !== DEFAULT_CONFIGURATION.startMinimized)

    showTaskbarCheckbox.checked = config.showTaskbar
    showTaskbarCheckbox.setDisabled(isUnavailable)
    showTaskbarRow.setModified(config.showTaskbar !== DEFAULT_CONFIGURATION.showTaskbar)

    hiddenFromShellNotice.setVisible(configurationService.isWindowHiddenFromShell())
  }

  syncFromConfig()

  store.add(
    configurationService.onDidChangeConfiguration(() => {
      syncFromConfig()
    }),
  )

  return {
    element: root,
    groups: [
      trayGroup.toEntry([
        showTrayIconRow.entry,
        trayIconRow.entry,
        minimizeToTrayRow.entry,
        startMinimizedRow.entry,
      ]),
      taskbarGroup.toEntry([showTaskbarRow.entry]),
    ],
    dispose(): void {
      store.dispose()
    },
  }
}
