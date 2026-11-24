import { $ } from '@app/base/browser/dom'
import { Button, Checkbox, SegmentedControl, Slider } from '@app/base/browser/ui'
import { DisposableStore } from '@app/base/common/lifecycle'
import {
  DEFAULT_CONFIGURATION,
  type SideBarPosition,
  type ThemeMode,
  WINDOW_OPACITY_LIMITS,
  ZOOM_LEVEL_LIMITS,
  clampWindowOpacity,
  clampZoomLevel,
  snapWindowOpacity,
  zoomLevelToZoomFactor,
} from '@app/platform/configuration/common/configuration'
import type { ServicesAccessor } from '@app/platform/instantiation/common/instantiation'
import { INativeHostService } from '@app/platform/native/common/native'
import { IWorkbenchConfigurationService } from '@app/workbench/services/configuration/browser/workbenchConfigurationService'
import { IWorkbenchLayoutService } from '@app/workbench/services/layout/browser/layoutService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { INotificationService } from '@app/workbench/services/notification/browser/notificationService'
import { type SettingsViewInstance, createSettingItem, createSettingsGroup } from './types'

const OPACITY_PERCENT_LIMITS = {
  min: Math.round(WINDOW_OPACITY_LIMITS.min * 100),
  max: Math.round(WINDOW_OPACITY_LIMITS.max * 100),
  step: Math.round(WINDOW_OPACITY_LIMITS.step * 100),
} as const

function opacityToPercent(opacity: number): number {
  return Math.round(clampWindowOpacity(opacity) * 100)
}

function percentToOpacity(percent: number): number {
  return clampWindowOpacity(percent / 100)
}

function commitOpacityPercent(percent: number): number {
  return snapWindowOpacity(percent / 100)
}

function formatZoomDisplay(level: number): string {
  const signed = level > 0 ? `+${level}` : String(level)
  const percent = Math.round(zoomLevelToZoomFactor(level) * 100)
  return `${signed} (${percent}%)`
}

export function createAppearanceSettingsView(accessor: ServicesAccessor): SettingsViewInstance {
  const configurationService = accessor.get(IWorkbenchConfigurationService)
  const layoutService = accessor.get(IWorkbenchLayoutService)
  const nativeHostService = accessor.get(INativeHostService)
  const notificationService = accessor.get(INotificationService)
  const localizationService = accessor.get(IWorkbenchLocalizationService)
  const t = (key: string, options?: Record<string, unknown>): string =>
    localizationService.t(key, options)

  const store = new DisposableStore()
  const root = $<HTMLDivElement>('div.settings-view-container')
  const categoryLabel = t('settings.appearance')
  const modifiedTooltip = t('settings.modified')
  const resetTooltip = t('settings.resetSetting')

  const interfaceGroup = createSettingsGroup(t('settings.interfaceSettings'))

  const themeOptions = [
    { value: 'light' as ThemeMode, icon: 'sun' as const, label: t('themes.light') },
    { value: 'dark' as ThemeMode, icon: 'moon' as const, label: t('themes.dark') },
    { value: 'system' as ThemeMode, icon: 'device-desktop' as const, label: t('themes.system') },
  ]
  const themeRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.theme'),
      description: t('settings.themeDescription'),
      keywords: themeOptions.map((option) => option.label),
      isModified: configurationService.getValue('theme') !== DEFAULT_CONFIGURATION.theme,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        void configurationService
          .updateConfiguration({ theme: DEFAULT_CONFIGURATION.theme })
          .catch(() => undefined)
      },
    },
    store,
  )
  const themeControl = store.add(
    new SegmentedControl<ThemeMode>(themeRow.controlContainer, {
      options: themeOptions,
      value: configurationService.getValue('theme'),
      ariaLabel: t('settings.theme'),
    }),
  )
  store.add(
    themeControl.onDidChange((nextTheme) => {
      void configurationService.updateConfiguration({ theme: nextTheme }).catch(() => undefined)
    }),
  )
  interfaceGroup.itemsContainer.appendChild(themeRow.element)

  const sideBarLocationOptions = [
    {
      value: 'left' as SideBarPosition,
      icon: 'layout-sidebar-left' as const,
      label: t('settings.sideBarLocations.left'),
    },
    {
      value: 'right' as SideBarPosition,
      icon: 'layout-sidebar-right' as const,
      label: t('settings.sideBarLocations.right'),
    },
  ]
  const sideBarLocationRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.sideBarLocation'),
      description: t('settings.sideBarLocationDescription'),
      keywords: sideBarLocationOptions.map((option) => option.label),
      isModified:
        configurationService.getValue('sideBarLocation') !== DEFAULT_CONFIGURATION.sideBarLocation,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        void configurationService
          .updateConfiguration({ sideBarLocation: DEFAULT_CONFIGURATION.sideBarLocation })
          .catch(() => undefined)
      },
    },
    store,
  )
  const sideBarLocationControl = store.add(
    new SegmentedControl<SideBarPosition>(sideBarLocationRow.controlContainer, {
      options: sideBarLocationOptions,
      value: configurationService.getValue('sideBarLocation'),
      ariaLabel: t('settings.sideBarLocation'),
    }),
  )
  store.add(
    sideBarLocationControl.onDidChange((nextLocation) => {
      void configurationService
        .updateConfiguration({ sideBarLocation: nextLocation })
        .catch(() => undefined)
    }),
  )
  interfaceGroup.itemsContainer.appendChild(sideBarLocationRow.element)

  const statusBarRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.statusBarVisible'),
      description: t('settings.statusBarVisibleDescription'),
      layout: 'checkbox',
      isModified:
        configurationService.getValue('statusBarVisible') !==
        DEFAULT_CONFIGURATION.statusBarVisible,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        void configurationService
          .updateConfiguration({ statusBarVisible: DEFAULT_CONFIGURATION.statusBarVisible })
          .catch(() => undefined)
      },
    },
    store,
  )
  const statusBarCheckbox = store.add(
    new Checkbox(statusBarRow.controlContainer, {
      checked: configurationService.getValue('statusBarVisible'),
      label: t('settings.statusBarVisibleDescription'),
      ariaLabel: t('settings.statusBarVisible'),
    }),
  )
  store.add(
    statusBarCheckbox.onDidChange((nextVisible) => {
      void configurationService
        .updateConfiguration({ statusBarVisible: nextVisible })
        .catch(() => undefined)
    }),
  )
  interfaceGroup.itemsContainer.appendChild(statusBarRow.element)

  const zoomRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.pageZoom'),
      description: t('settings.pageZoomDescription'),
      keywords: [t('settings.zoomIn'), t('settings.zoomOut'), t('settings.resetZoom')],
      isModified: configurationService.getValue('zoomLevel') !== DEFAULT_CONFIGURATION.zoomLevel,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        void configurationService
          .updateConfiguration({ zoomLevel: DEFAULT_CONFIGURATION.zoomLevel })
          .catch(() => undefined)
      },
    },
    store,
  )
  const zoomGroup = $<HTMLDivElement>('div.settings-zoom-control')
  zoomRow.controlContainer.appendChild(zoomGroup)

  const changeZoomLevel = (delta: number): void => {
    const currentZoom = configurationService.getValue('zoomLevel')
    void configurationService
      .updateConfiguration({ zoomLevel: clampZoomLevel(Math.round(currentZoom) + delta) })
      .catch(() => undefined)
  }

  const zoomOutButton = store.add(
    new Button(zoomGroup, {
      icon: 'minus',
      variant: 'icon',
      title: t('settings.zoomOut'),
      ariaLabel: t('settings.zoomOut'),
    }),
  )
  store.add(zoomOutButton.onDidClick(() => changeZoomLevel(-ZOOM_LEVEL_LIMITS.step)))

  const zoomValueElement = $<HTMLSpanElement>('span.settings-zoom-value')
  zoomGroup.appendChild(zoomValueElement)

  const zoomInButton = store.add(
    new Button(zoomGroup, {
      icon: 'plus',
      variant: 'icon',
      title: t('settings.zoomIn'),
      ariaLabel: t('settings.zoomIn'),
    }),
  )
  store.add(zoomInButton.onDidClick(() => changeZoomLevel(ZOOM_LEVEL_LIMITS.step)))

  const resetZoomButton = store.add(
    new Button(zoomGroup, {
      icon: 'discard',
      variant: 'icon',
      title: t('settings.resetZoom'),
      ariaLabel: t('settings.resetZoom'),
    }),
  )
  store.add(
    resetZoomButton.onDidClick(() => {
      void configurationService
        .updateConfiguration({ zoomLevel: ZOOM_LEVEL_LIMITS.default })
        .catch(() => undefined)
    }),
  )
  interfaceGroup.itemsContainer.appendChild(zoomRow.element)

  const windowGroup = createSettingsGroup(t('settings.windowSettings'))

  const opacityRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.windowOpacity'),
      description: t('settings.windowOpacityDescription'),
      isModified:
        configurationService.getValue('windowOpacity') !== DEFAULT_CONFIGURATION.windowOpacity,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        const defaultOpacity = DEFAULT_CONFIGURATION.windowOpacity
        void nativeHostService.setOpacity(defaultOpacity).catch(() => undefined)
        void configurationService
          .updateConfiguration({ windowOpacity: defaultOpacity })
          .catch(() => undefined)
      },
    },
    store,
  )
  const opacitySlider = store.add(
    new Slider(opacityRow.controlContainer, {
      min: OPACITY_PERCENT_LIMITS.min,
      max: OPACITY_PERCENT_LIMITS.max,
      step: OPACITY_PERCENT_LIMITS.step,
      value: opacityToPercent(configurationService.getValue('windowOpacity')),
      ariaLabel: t('settings.windowOpacity'),
      formatValue: (value) => `${value}%`,
    }),
  )
  store.add(
    opacitySlider.onDidInput((nextPercent) => {
      void nativeHostService.setOpacity(percentToOpacity(nextPercent)).catch(() => undefined)
    }),
  )
  store.add(
    opacitySlider.onDidChange((nextPercent) => {
      void configurationService
        .updateConfiguration({ windowOpacity: commitOpacityPercent(nextPercent) })
        .catch(() => undefined)
    }),
  )
  windowGroup.itemsContainer.appendChild(opacityRow.element)

  const alwaysOnTopRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.alwaysOnTop'),
      description: t('settings.alwaysOnTopDescription'),
      layout: 'checkbox',
      isModified:
        configurationService.getValue('alwaysOnTop') !== DEFAULT_CONFIGURATION.alwaysOnTop,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        void configurationService
          .updateConfiguration({ alwaysOnTop: DEFAULT_CONFIGURATION.alwaysOnTop })
          .catch(() => undefined)
      },
    },
    store,
  )
  const alwaysOnTopCheckbox = store.add(
    new Checkbox(alwaysOnTopRow.controlContainer, {
      checked: configurationService.getValue('alwaysOnTop'),
      label: t('settings.alwaysOnTopDescription'),
      ariaLabel: t('settings.alwaysOnTop'),
    }),
  )
  store.add(
    alwaysOnTopCheckbox.onDidChange((nextValue) => {
      void configurationService
        .updateConfiguration({ alwaysOnTop: nextValue })
        .catch(() => undefined)
    }),
  )
  windowGroup.itemsContainer.appendChild(alwaysOnTopRow.element)

  const resetLayoutRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.resetWindowLayout'),
      description: t('settings.resetWindowLayoutDescription'),
      keywords: [t('settings.resetWindowLayoutAction')],
    },
    store,
  )
  let resettingLayout = false
  const resetLayoutButton = store.add(
    new Button(resetLayoutRow.controlContainer, {
      icon: 'discard',
      label: t('settings.resetWindowLayoutAction'),
      variant: 'secondary',
    }),
  )
  store.add(
    resetLayoutButton.onDidClick(() => {
      if (resettingLayout) {
        return
      }
      resettingLayout = true
      resetLayoutButton.setLoading(true)
      void layoutService
        .resetLayout()
        .then((ok) => {
          if (ok) {
            notificationService.success(t('settings.windowLayoutReset'))
          }
        })
        .finally(() => {
          resettingLayout = false
          if (!store.isDisposed) {
            resetLayoutButton.setLoading(false)
          }
        })
    }),
  )
  windowGroup.itemsContainer.appendChild(resetLayoutRow.element)

  root.appendChild(interfaceGroup.element)
  root.appendChild(windowGroup.element)

  const syncFromConfig = (): void => {
    const config = configurationService.getConfiguration()

    themeControl.value = config.theme
    themeRow.setModified(config.theme !== DEFAULT_CONFIGURATION.theme)

    sideBarLocationControl.value = config.sideBarLocation
    sideBarLocationRow.setModified(config.sideBarLocation !== DEFAULT_CONFIGURATION.sideBarLocation)

    statusBarCheckbox.checked = config.statusBarVisible
    statusBarRow.setModified(config.statusBarVisible !== DEFAULT_CONFIGURATION.statusBarVisible)

    zoomValueElement.textContent = formatZoomDisplay(config.zoomLevel)
    zoomOutButton.setEnabled(config.zoomLevel > ZOOM_LEVEL_LIMITS.min)
    zoomInButton.setEnabled(config.zoomLevel < ZOOM_LEVEL_LIMITS.max)
    resetZoomButton.setEnabled(config.zoomLevel !== ZOOM_LEVEL_LIMITS.default)
    zoomRow.setModified(config.zoomLevel !== DEFAULT_CONFIGURATION.zoomLevel)

    opacitySlider.value = opacityToPercent(config.windowOpacity)
    opacityRow.setModified(config.windowOpacity !== DEFAULT_CONFIGURATION.windowOpacity)

    alwaysOnTopCheckbox.checked = config.alwaysOnTop
    alwaysOnTopRow.setModified(config.alwaysOnTop !== DEFAULT_CONFIGURATION.alwaysOnTop)
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
      interfaceGroup.toEntry([
        themeRow.entry,
        sideBarLocationRow.entry,
        statusBarRow.entry,
        zoomRow.entry,
      ]),
      windowGroup.toEntry([opacityRow.entry, alwaysOnTopRow.entry, resetLayoutRow.entry]),
    ],
    dispose(): void {
      store.dispose()
    },
  }
}
