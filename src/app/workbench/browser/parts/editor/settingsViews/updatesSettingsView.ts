import { $, clearNode, toggleClass } from '@app/base/browser/dom'
import { Button, Checkbox, ProgressBar } from '@app/base/browser/ui'
import { DisposableStore, MutableDisposable } from '@app/base/common/lifecycle'
import { DEFAULT_CONFIGURATION } from '@app/platform/configuration/common/configuration'
import type { ServicesAccessor } from '@app/platform/instantiation/common/instantiation'
import { INativeHostService } from '@app/platform/native/common/native'
import { IProductService } from '@app/platform/product/common/productService'
import type { UpdateStateEvent } from '@app/platform/update/common/update'
import { IWorkbenchConfigurationService } from '@app/workbench/services/configuration/browser/workbenchConfigurationService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { IWorkbenchLogService } from '@app/workbench/services/log/browser/rendererLogService'
import { INotificationService } from '@app/workbench/services/notification/browser/notificationService'
import { IWorkbenchUpdateService } from '@app/workbench/services/update/browser/updateWorkbenchService'
import { type SettingsViewInstance, createSettingItem, createSettingsGroup } from './types'

function resolveUpdateStatusText(
  update: UpdateStateEvent,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  switch (update.state) {
    case 'checking':
      return t('settings.checking')
    case 'available':
      return t('settings.updateAvailable', { version: update.version ?? '' })
    case 'downloading':
      return t('settings.downloading', { percent: update.percent ?? 0 })
    case 'downloaded':
      return t('settings.readyToInstall', { version: update.version ?? '' })
    case 'error':
      return t('settings.updateError')
    default:
      return t('settings.upToDate')
  }
}

export function createUpdatesSettingsView(accessor: ServicesAccessor): SettingsViewInstance {
  const configurationService = accessor.get(IWorkbenchConfigurationService)
  const updateService = accessor.get(IWorkbenchUpdateService)
  const nativeHostService = accessor.get(INativeHostService)
  const productService = accessor.get(IProductService)
  const logService = accessor.get(IWorkbenchLogService)
  const notificationService = accessor.get(INotificationService)
  const localizationService = accessor.get(IWorkbenchLocalizationService)
  const t = (key: string, options?: Record<string, unknown>): string =>
    localizationService.t(key, options)

  const store = new DisposableStore()
  const root = $<HTMLDivElement>('div.settings-view-container')
  const categoryLabel = t('settings.updates')
  const modifiedTooltip = t('settings.modified')
  const resetTooltip = t('settings.resetSetting')

  const updatesGroup = createSettingsGroup(t('settings.updates'))

  const autoUpdateRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.checkUpdatesOnStartup'),
      description: t('settings.checkUpdatesOnStartupDescription'),
      layout: 'checkbox',
      isModified: configurationService.getValue('autoUpdate') !== DEFAULT_CONFIGURATION.autoUpdate,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        void configurationService
          .updateConfiguration({ autoUpdate: DEFAULT_CONFIGURATION.autoUpdate })
          .catch(() => undefined)
      },
    },
    store,
  )
  const autoUpdateCheckbox = store.add(
    new Checkbox(autoUpdateRow.controlContainer, {
      checked: configurationService.getValue('autoUpdate'),
      label: t('settings.checkUpdatesOnStartupDescription'),
      ariaLabel: t('settings.checkUpdatesOnStartup'),
    }),
  )
  store.add(
    autoUpdateCheckbox.onDidChange((nextValue) => {
      void configurationService
        .updateConfiguration({ autoUpdate: nextValue })
        .catch(() => undefined)
    }),
  )
  updatesGroup.itemsContainer.appendChild(autoUpdateRow.element)

  const unattendedRow = createSettingItem(
    {
      category: categoryLabel,
      title: t('settings.unattendedUpdates'),
      description: t('settings.unattendedUpdatesDescription'),
      layout: 'checkbox',
      isModified:
        configurationService.getValue('unattendedUpdates') !==
        DEFAULT_CONFIGURATION.unattendedUpdates,
      modifiedTooltip,
      resetTooltip,
      onReset: () => {
        if (configurationService.getValue('autoUpdate')) {
          void configurationService
            .updateConfiguration({ unattendedUpdates: DEFAULT_CONFIGURATION.unattendedUpdates })
            .catch(() => undefined)
        }
      },
    },
    store,
  )
  const unattendedCheckbox = store.add(
    new Checkbox(unattendedRow.controlContainer, {
      checked: configurationService.getValue('unattendedUpdates'),
      disabled: !configurationService.getValue('autoUpdate'),
      label: t('settings.unattendedUpdatesDescription'),
      ariaLabel: t('settings.unattendedUpdates'),
    }),
  )
  store.add(
    unattendedCheckbox.onDidChange((nextValue) => {
      void configurationService
        .updateConfiguration({ unattendedUpdates: nextValue })
        .catch(() => undefined)
    }),
  )
  updatesGroup.itemsContainer.appendChild(unattendedRow.element)

  const statusRow = createSettingItem(
    {
      category: categoryLabel,
      title: resolveUpdateStatusText(updateService.state, t),
      description: t('settings.version', { version: productService.version }),
      keywords: [
        t('settings.checkUpdates'),
        t('settings.installNow'),
        t('settings.openDownloadPage'),
        t('settings.releaseNotes'),
      ],
      layout: 'inline',
    },
    store,
  )
  const progressBar = store.add(new ProgressBar(statusRow.extraContainer))
  const actionDisposables = store.add(new MutableDisposable<DisposableStore>())

  const releaseNotesContainer = $<HTMLDivElement>('div.settings-release-notes.hidden')
  const releaseNotesHeading = $<HTMLElement>(
    'strong.settings-release-notes-title',
    undefined,
    t('settings.releaseNotes'),
  )
  const releaseNotesPre = $<HTMLPreElement>('pre.settings-release-notes-body')
  releaseNotesContainer.appendChild(releaseNotesHeading)
  releaseNotesContainer.appendChild(releaseNotesPre)

  updatesGroup.itemsContainer.appendChild(statusRow.element)
  updatesGroup.itemsContainer.appendChild(releaseNotesContainer)

  root.appendChild(updatesGroup.element)

  const openReleasePage = (url: string): void => {
    void nativeHostService.openExternal(url).catch((error: unknown) => {
      logService.error('UpdatesSettingsView', 'External URL could not be opened.', error)
      notificationService.error(t('errors.generic'))
    })
  }

  const syncFromConfig = (): void => {
    const config = configurationService.getConfiguration()

    autoUpdateCheckbox.checked = config.autoUpdate
    autoUpdateRow.setModified(config.autoUpdate !== DEFAULT_CONFIGURATION.autoUpdate)

    unattendedCheckbox.checked = config.unattendedUpdates
    unattendedCheckbox.setDisabled(!config.autoUpdate)
    unattendedRow.setModified(config.unattendedUpdates !== DEFAULT_CONFIGURATION.unattendedUpdates)
  }

  const syncFromUpdate = (update: UpdateStateEvent): void => {
    statusRow.setTitle(resolveUpdateStatusText(update, t))

    const isDownloading = update.state === 'downloading'
    toggleClass(statusRow.extraContainer, 'hidden', !isDownloading)
    progressBar.setProgress(isDownloading ? (update.percent ?? 0) : null)

    const nextActionStore = new DisposableStore()
    actionDisposables.value = nextActionStore
    clearNode(statusRow.controlContainer)

    const releasePageUrl = update.state === 'available' ? update.pageUrl : undefined
    if (update.state === 'downloaded') {
      const installButton = nextActionStore.add(
        new Button(statusRow.controlContainer, {
          label: t('settings.installNow'),
          variant: 'primary',
        }),
      )
      nextActionStore.add(
        installButton.onDidClick(() => {
          void updateService.installUpdate()
        }),
      )
    } else if (releasePageUrl) {
      const downloadButton = nextActionStore.add(
        new Button(statusRow.controlContainer, {
          icon: 'link-external',
          label: t('settings.openDownloadPage'),
          variant: 'primary',
        }),
      )
      nextActionStore.add(
        downloadButton.onDidClick(() => {
          openReleasePage(releasePageUrl)
        }),
      )
    } else {
      const checkButton = nextActionStore.add(
        new Button(statusRow.controlContainer, {
          icon: 'refresh',
          label: t('settings.checkUpdates'),
          variant: 'secondary',
          loading: update.state === 'checking',
        }),
      )
      nextActionStore.add(
        checkButton.onDidClick(() => {
          void updateService.checkForUpdates()
        }),
      )
    }

    const notes = update.releaseNotes?.trim()
    if (notes) {
      releaseNotesPre.textContent = notes
      toggleClass(releaseNotesContainer, 'hidden', false)
    } else {
      releaseNotesPre.textContent = ''
      toggleClass(releaseNotesContainer, 'hidden', true)
    }
  }

  syncFromConfig()
  syncFromUpdate(updateService.state)

  store.add(
    configurationService.onDidChangeConfiguration(() => {
      syncFromConfig()
    }),
  )
  store.add(
    updateService.onDidChangeState((nextState) => {
      syncFromUpdate(nextState)
    }),
  )

  return {
    element: root,
    groups: [updatesGroup.toEntry([autoUpdateRow.entry, unattendedRow.entry, statusRow.entry])],
    dispose(): void {
      store.dispose()
    },
  }
}
