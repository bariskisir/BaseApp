import { $ } from '@app/base/browser/dom'
import { Button, Checkbox } from '@app/base/browser/ui'
import { DisposableStore } from '@app/base/common/lifecycle'
import { DEFAULT_CONFIGURATION } from '@app/platform/configuration/common/configuration'
import type { ServicesAccessor } from '@app/platform/instantiation/common/instantiation'
import { INativeHostService } from '@app/platform/native/common/native'
import { IWorkbenchConfigurationService } from '@app/workbench/services/configuration/browser/workbenchConfigurationService'
import { IDialogService } from '@app/workbench/services/dialog/browser/dialogService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { IWorkbenchLogService } from '@app/workbench/services/log/browser/rendererLogService'
import { INotificationService } from '@app/workbench/services/notification/browser/notificationService'
import { type SettingsViewInstance, createSettingItem, createSettingsGroup } from './types'

export function createPrivacyDataSettingsView(accessor: ServicesAccessor): SettingsViewInstance {
  const configurationService = accessor.get(IWorkbenchConfigurationService)
  const nativeHostService = accessor.get(INativeHostService)
  const logService = accessor.get(IWorkbenchLogService)
  const notificationService = accessor.get(INotificationService)
  const localizationService = accessor.get(IWorkbenchLocalizationService)
  const dialogService = accessor.get(IDialogService)
  const t = (key: string, options?: Record<string, unknown>): string =>
    localizationService.t(key, options)

  const store = new DisposableStore()
  const root = $<HTMLDivElement>('div.settings-view-container')
  const categoryLabel = t('settings.privacyAndData')
  const modifiedTooltip = t('settings.modified')
  const resetTooltip = t('settings.resetSetting')

  const privacyGroup = createSettingsGroup(t('settings.privacy'))

  const contentProtectionRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.contentProtection'),
      description: t('settings.contentProtectionDescription'),
      layout: 'checkbox',
      isModified:
        configurationService.getValue('contentProtection') !==
        DEFAULT_CONFIGURATION.contentProtection,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        void configurationService
          .updateConfiguration({ contentProtection: DEFAULT_CONFIGURATION.contentProtection })
          .catch(() => undefined)
      },
    },
    store,
  )
  const contentProtectionCheckbox = store.add(
    new Checkbox(contentProtectionRow.controlContainer, {
      checked: configurationService.getValue('contentProtection'),
      label: t('settings.contentProtectionDescription'),
      ariaLabel: t('settings.contentProtection'),
    }),
  )
  store.add(
    contentProtectionCheckbox.onDidChange((nextValue) => {
      void configurationService
        .updateConfiguration({ contentProtection: nextValue })
        .catch(() => undefined)
    }),
  )
  privacyGroup.itemsContainer.appendChild(contentProtectionRow.element)

  const telemetryRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.telemetryCollection'),
      description: t('settings.telemetryDescription'),
      layout: 'checkbox',
      isModified:
        configurationService.getValue('telemetryEnabled') !==
        DEFAULT_CONFIGURATION.telemetryEnabled,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        void configurationService
          .updateConfiguration({ telemetryEnabled: DEFAULT_CONFIGURATION.telemetryEnabled })
          .catch(() => undefined)
      },
    },
    store,
  )
  const telemetryCheckbox = store.add(
    new Checkbox(telemetryRow.controlContainer, {
      checked: configurationService.getValue('telemetryEnabled'),
      label: t('settings.telemetryDescription'),
      ariaLabel: t('settings.telemetryCollection'),
    }),
  )
  store.add(
    telemetryCheckbox.onDidChange((nextValue) => {
      void configurationService
        .updateConfiguration({ telemetryEnabled: nextValue })
        .catch(() => undefined)
    }),
  )
  privacyGroup.itemsContainer.appendChild(telemetryRow.element)

  const dataGroup = createSettingsGroup(t('settings.dataAndBackup'))

  const backupRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.backupSettings'),
      description: t('settings.backupSettingsDescription'),
      keywords: [t('settings.exportSettings'), t('settings.importSettings')],
    },
    store,
  )
  const backupActions = $<HTMLDivElement>('div.settings-action-row')
  backupRow.controlContainer.appendChild(backupActions)

  let exporting = false
  const exportButton = store.add(
    new Button(backupActions, {
      icon: 'cloud-download',
      label: t('settings.exportSettings'),
      variant: 'secondary',
    }),
  )
  store.add(
    exportButton.onDidClick(() => {
      if (exporting) {
        return
      }
      exporting = true
      exportButton.setLoading(true)
      void configurationService
        .exportConfiguration()
        .then((ok) => {
          if (ok) {
            notificationService.success(t('settings.settingsExported'))
          }
        })
        .finally(() => {
          exporting = false
          if (!store.isDisposed) {
            exportButton.setLoading(false)
          }
        })
    }),
  )

  let importing = false
  const importButton = store.add(
    new Button(backupActions, {
      icon: 'cloud-upload',
      label: t('settings.importSettings'),
      variant: 'secondary',
    }),
  )
  store.add(
    importButton.onDidClick(() => {
      if (importing) {
        return
      }
      importing = true
      importButton.setLoading(true)
      void configurationService
        .importConfiguration()
        .then((ok) => {
          if (ok) {
            notificationService.success(t('settings.settingsImported'))
          }
        })
        .finally(() => {
          importing = false
          if (!store.isDisposed) {
            importButton.setLoading(false)
          }
        })
    }),
  )
  dataGroup.itemsContainer.appendChild(backupRow.element)

  const dataFolderRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.dataFolder'),
      description: t('settings.dataFolderDescription'),
      keywords: [t('settings.openFolder')],
    },
    store,
  )
  const openFolderButton = store.add(
    new Button(dataFolderRow.controlContainer, {
      icon: 'folder-opened',
      label: t('settings.openFolder'),
      variant: 'secondary',
    }),
  )
  store.add(
    openFolderButton.onDidClick(() => {
      void nativeHostService.openDataDirectory().catch((error: unknown) => {
        logService.error('PrivacyDataSettingsView', 'Data directory could not be opened.', error)
        notificationService.error(t('errors.generic'))
      })
    }),
  )
  dataGroup.itemsContainer.appendChild(dataFolderRow.element)

  const resetSettingsRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.resetSettings'),
      description: t('settings.resetSettingsDescription'),
      keywords: [t('settings.resetSettingsAction')],
    },
    store,
  )
  let resetting = false
  const resetSettingsButton = store.add(
    new Button(resetSettingsRow.controlContainer, {
      icon: 'discard',
      label: t('settings.resetSettingsAction'),
      variant: 'danger',
    }),
  )
  store.add(
    resetSettingsButton.onDidClick(() => {
      if (resetting) {
        return
      }
      void dialogService
        .confirm({
          title: t('settings.resetSettingsConfirmTitle'),
          detail: t('settings.resetSettingsConfirmDescription'),
          confirmLabel: t('settings.resetSettingsAction'),
          cancelLabel: t('common.cancel'),
          danger: true,
        })
        .then(async (confirmed) => {
          if (!confirmed || resetting) {
            return
          }
          resetting = true
          if (!store.isDisposed) {
            resetSettingsButton.setLoading(true)
          }
          try {
            await configurationService.resetConfiguration()
            notificationService.success(t('settings.settingsReset'))
          } catch {
            return
          } finally {
            resetting = false
            if (!store.isDisposed) {
              resetSettingsButton.setLoading(false)
            }
          }
        })
    }),
  )
  dataGroup.itemsContainer.appendChild(resetSettingsRow.element)

  root.appendChild(privacyGroup.element)
  root.appendChild(dataGroup.element)

  const syncFromConfig = (): void => {
    const config = configurationService.getConfiguration()

    contentProtectionCheckbox.checked = config.contentProtection
    contentProtectionRow.setModified(
      config.contentProtection !== DEFAULT_CONFIGURATION.contentProtection,
    )

    telemetryCheckbox.checked = config.telemetryEnabled
    telemetryRow.setModified(config.telemetryEnabled !== DEFAULT_CONFIGURATION.telemetryEnabled)
  }

  store.add(
    configurationService.onDidChangeConfiguration(() => {
      syncFromConfig()
    }),
  )

  return {
    element: root,
    groups: [
      privacyGroup.toEntry([contentProtectionRow.entry, telemetryRow.entry]),
      dataGroup.toEntry([backupRow.entry, dataFolderRow.entry, resetSettingsRow.entry]),
    ],
    dispose(): void {
      store.dispose()
    },
  }
}
