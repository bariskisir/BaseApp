import { $ } from '@app/base/browser/dom'
import { Button, Checkbox, SelectBox } from '@app/base/browser/ui'
import { formatBytes } from '@app/base/common/formatters'
import { DisposableStore } from '@app/base/common/lifecycle'
import { DEFAULT_CONFIGURATION } from '@app/platform/configuration/common/configuration'
import type { ServicesAccessor } from '@app/platform/instantiation/common/instantiation'
import { LOG_LEVELS, type LogLevel, type LogsSummary } from '@app/platform/log/common/log'
import { INativeHostService } from '@app/platform/native/common/native'
import { IWorkbenchConfigurationService } from '@app/workbench/services/configuration/browser/workbenchConfigurationService'
import { IDialogService } from '@app/workbench/services/dialog/browser/dialogService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { IWorkbenchLogService } from '@app/workbench/services/log/browser/rendererLogService'
import { INotificationService } from '@app/workbench/services/notification/browser/notificationService'
import {
  type SettingsViewInstance,
  createInlineNotice,
  createSettingItem,
  createSettingsGroup,
} from './types'

export function createSystemSettingsView(accessor: ServicesAccessor): SettingsViewInstance {
  const configurationService = accessor.get(IWorkbenchConfigurationService)
  const logService = accessor.get(IWorkbenchLogService)
  const nativeHostService = accessor.get(INativeHostService)
  const notificationService = accessor.get(INotificationService)
  const localizationService = accessor.get(IWorkbenchLocalizationService)
  const dialogService = accessor.get(IDialogService)
  const t = (key: string, options?: Record<string, unknown>): string =>
    localizationService.t(key, options)

  const store = new DisposableStore()
  const root = $<HTMLDivElement>('div.settings-view-container')
  const categoryLabel = t('settings.system')
  const modifiedTooltip = t('settings.modified')
  const resetTooltip = t('settings.resetSetting')

  const logLevelOptions = LOG_LEVELS.map((level) => ({
    value: level,
    label: t(`settings.logLevels.${level}`),
  }))

  const performanceGroup = createSettingsGroup(t('settings.performance'))

  const hardwareAccelerationRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.hardwareAcceleration'),
      description: t('settings.hardwareAccelerationDescription'),
      layout: 'checkbox',
      isModified:
        configurationService.getValue('hardwareAcceleration') !==
        DEFAULT_CONFIGURATION.hardwareAcceleration,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        void configurationService
          .updateConfiguration({
            hardwareAcceleration: DEFAULT_CONFIGURATION.hardwareAcceleration,
          })
          .catch(() => undefined)
      },
    },
    store,
  )
  const hardwareAccelerationCheckbox = store.add(
    new Checkbox(hardwareAccelerationRow.controlContainer, {
      checked: configurationService.getValue('hardwareAcceleration'),
      label: t('settings.hardwareAccelerationDescription'),
      ariaLabel: t('settings.hardwareAcceleration'),
    }),
  )
  store.add(
    hardwareAccelerationCheckbox.onDidChange((nextValue) => {
      void configurationService
        .updateConfiguration({ hardwareAcceleration: nextValue })
        .catch(() => undefined)
    }),
  )
  performanceGroup.itemsContainer.appendChild(hardwareAccelerationRow.element)

  const handleRelaunch = (): void => {
    void nativeHostService.relaunch().catch((error: unknown) => {
      logService.error('SystemSettingsView', 'Application could not be restarted.', error)
      notificationService.error(t('errors.generic'))
    })
  }

  const restartNotice = createInlineNotice(
    'refresh',
    t('settings.restartRequired'),
    'info',
    {
      label: t('settings.restartNow'),
      onClick: handleRelaunch,
    },
    store,
  )
  performanceGroup.itemsContainer.appendChild(restartNotice.element)

  const loggingGroup = createSettingsGroup(t('settings.logging'))

  const logLevelRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.logLevel'),
      description: t('settings.logLevelDescription'),
      keywords: logLevelOptions.map((option) => option.label),
      isModified: configurationService.getValue('logLevel') !== DEFAULT_CONFIGURATION.logLevel,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        void configurationService
          .updateConfiguration({ logLevel: DEFAULT_CONFIGURATION.logLevel })
          .catch(() => undefined)
      },
    },
    store,
  )
  const logLevelSelect = store.add(
    new SelectBox<LogLevel>(logLevelRow.controlContainer, {
      options: logLevelOptions,
      value: configurationService.getValue('logLevel'),
      ariaLabel: t('settings.logLevel'),
    }),
  )
  store.add(
    logLevelSelect.onDidChange((nextLevel) => {
      void configurationService.updateConfiguration({ logLevel: nextLevel }).catch(() => undefined)
    }),
  )
  loggingGroup.itemsContainer.appendChild(logLevelRow.element)

  const logFilesRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.logFiles'),
      description: t('settings.logFilesDescription'),
      keywords: [t('settings.openLogs'), t('settings.clearLogs')],
    },
    store,
  )
  const logActions = $<HTMLDivElement>('div.settings-action-row')
  logFilesRow.controlContainer.appendChild(logActions)

  let logsSummary: LogsSummary | null = null
  let clearingLogs = false

  const openLogsButton = store.add(
    new Button(logActions, {
      icon: 'folder-opened',
      label: t('settings.openLogs'),
      variant: 'secondary',
    }),
  )
  store.add(
    openLogsButton.onDidClick(() => {
      void logService.openLogsDirectory().catch((error: unknown) => {
        logService.error('SystemSettingsView', 'Log directory could not be opened.', error)
        notificationService.error(t('errors.generic'))
      })
    }),
  )

  const clearLogsButton = store.add(
    new Button(logActions, {
      icon: 'trash',
      label: t('settings.clearLogs'),
      variant: 'danger',
      disabled: true,
    }),
  )

  const syncLogsSummary = (): void => {
    const canClear = logsSummary !== null && logsSummary.fileCount > 0
    const description =
      logsSummary && logsSummary.fileCount > 0
        ? t('settings.logFilesSummary', {
            count: logsSummary.fileCount,
            size: formatBytes(logsSummary.totalBytes),
          })
        : t('settings.logFilesDescription')
    logFilesRow.setDescription(description)
    clearLogsButton.setEnabled(!clearingLogs && canClear)
    clearLogsButton.setLoading(clearingLogs)
  }

  store.add(
    clearLogsButton.onDidClick(() => {
      const canClear = logsSummary !== null && logsSummary.fileCount > 0
      if (clearingLogs || !canClear) {
        return
      }
      void dialogService
        .confirm({
          title: t('settings.clearLogsConfirmTitle'),
          detail: t('settings.clearLogsConfirmDescription'),
          confirmLabel: t('settings.clearLogs'),
          cancelLabel: t('common.cancel'),
          danger: true,
        })
        .then(async (confirmed) => {
          if (!confirmed || clearingLogs) {
            return
          }
          clearingLogs = true
          if (!store.isDisposed) {
            syncLogsSummary()
          }
          try {
            const nextSummary = await logService.clearLogs()
            logsSummary = nextSummary
            notificationService.success(t('settings.logsCleared'))
          } catch (error: unknown) {
            logService.error('SystemSettingsView', 'Log files could not be cleared.', error)
            notificationService.error(t('errors.generic'))
          } finally {
            clearingLogs = false
            if (!store.isDisposed) {
              syncLogsSummary()
            }
          }
        })
    }),
  )

  loggingGroup.itemsContainer.appendChild(logFilesRow.element)

  root.appendChild(performanceGroup.element)
  root.appendChild(loggingGroup.element)

  const syncFromConfig = (): void => {
    const config = configurationService.getConfiguration()

    hardwareAccelerationCheckbox.checked = config.hardwareAcceleration
    hardwareAccelerationRow.setModified(
      config.hardwareAcceleration !== DEFAULT_CONFIGURATION.hardwareAcceleration,
    )
    restartNotice.setVisible(configurationService.isHardwareAccelerationRestartRequired())

    logLevelSelect.value = config.logLevel
    logLevelRow.setModified(config.logLevel !== DEFAULT_CONFIGURATION.logLevel)
  }

  syncFromConfig()
  syncLogsSummary()

  void logService
    .getLogsSummary()
    .then((summary) => {
      if (!store.isDisposed) {
        logsSummary = summary
        syncLogsSummary()
      }
    })
    .catch((error: unknown) => {
      logService.warn('SystemSettingsView', 'Log summary could not be loaded.', error)
    })

  store.add(
    configurationService.onDidChangeConfiguration(() => {
      syncFromConfig()
    }),
  )

  return {
    element: root,
    groups: [
      performanceGroup.toEntry([hardwareAccelerationRow.entry]),
      loggingGroup.toEntry([logLevelRow.entry, logFilesRow.entry]),
    ],
    dispose(): void {
      store.dispose()
    },
  }
}
