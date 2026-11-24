import { renderCodicon } from '@app/base/browser/codicons'
import { $, addDisposableListener } from '@app/base/browser/dom'
import { attachTooltip } from '@app/base/browser/ui'
import { DisposableStore } from '@app/base/common/lifecycle'
import type { ServicesAccessor } from '@app/platform/instantiation/common/instantiation'
import { INativeHostService, type RuntimeInfo } from '@app/platform/native/common/native'
import { IProductService } from '@app/platform/product/common/productService'
import { APP_LOGO_URL } from '@app/workbench/browser/assets/brand'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { IWorkbenchLogService } from '@app/workbench/services/log/browser/rendererLogService'
import { INotificationService } from '@app/workbench/services/notification/browser/notificationService'
import { type SettingsRowEntry, type SettingsViewInstance, createSettingsGroup } from './types'

interface AboutLinkSpec {
  readonly title: string
  readonly value: string
  readonly url: string
}

type RuntimeRowKey = Exclude<keyof RuntimeInfo, 'platform'> | 'license'

interface RuntimeRowRef {
  readonly key: RuntimeRowKey
  readonly valueElement: HTMLSpanElement
}

export function createAboutSettingsView(accessor: ServicesAccessor): SettingsViewInstance {
  const productService = accessor.get(IProductService)
  const nativeHostService = accessor.get(INativeHostService)
  const logService = accessor.get(IWorkbenchLogService)
  const notificationService = accessor.get(INotificationService)
  const localizationService = accessor.get(IWorkbenchLocalizationService)
  const t = (key: string, options?: Record<string, unknown>): string =>
    localizationService.t(key, options)

  const store = new DisposableStore()
  const root = $<HTMLDivElement>('div.settings-view-container')
  const categoryLabel = t('settings.about')

  const openExternal = (url: string): void => {
    void nativeHostService.openExternal(url).catch((error: unknown) => {
      logService.error('AboutSettingsView', 'External URL could not be opened.', error)
      notificationService.error(t('errors.generic'))
    })
  }

  root.appendChild(
    $<HTMLDivElement>(
      'div.settings-about-card',
      undefined,
      $<HTMLDivElement>(
        'div.settings-about-emblem',
        undefined,
        $<HTMLImageElement>('img.settings-about-logo', { src: APP_LOGO_URL, alt: '' }),
      ),
      $<HTMLDivElement>(
        'div.settings-about-identity',
        undefined,
        $<HTMLDivElement>(
          'div.settings-about-title-row',
          undefined,
          $<HTMLHeadingElement>('h2.settings-about-name', undefined, t('app.name')),
          $<HTMLSpanElement>(
            'span.settings-about-version.selectable',
            undefined,
            `v${productService.version}`,
          ),
        ),
        $<HTMLParagraphElement>('p.settings-about-tagline', undefined, t('app.tagline')),
      ),
    ),
  )

  const links: readonly AboutLinkSpec[] = [
    {
      title: t('settings.author'),
      value: productService.author,
      url: productService.authorUrl,
    },
    {
      title: t('settings.sourceCode'),
      value: productService.repository,
      url: productService.repositoryUrl,
    },
    {
      title: t('settings.releases'),
      value: t('settings.releasesDescription'),
      url: productService.releasesUrl,
    },
    {
      title: t('settings.reportIssue'),
      value: t('settings.reportIssueDescription'),
      url: productService.issuesUrl,
    },
  ]

  const resourcesGroup = createSettingsGroup(t('settings.aboutResources'))
  const linkList = $<HTMLDivElement>('div.settings-about-link-list')
  const linkEntries: SettingsRowEntry[] = []

  for (const spec of links) {
    const linkElement = $<HTMLAnchorElement>(
      'a.settings-about-link',
      { href: spec.url, 'aria-label': `${spec.title}: ${spec.value}` },
      $<HTMLSpanElement>('span.settings-about-link-title', undefined, spec.title),
      $<HTMLSpanElement>('span.settings-about-link-value', undefined, spec.value),
      $<HTMLSpanElement>(
        'span.settings-about-link-icon',
        undefined,
        renderCodicon('link-external', 14),
      ),
    )
    store.add(attachTooltip(linkElement, spec.url))
    store.add(
      addDisposableListener(linkElement, 'click', (event) => {
        event.preventDefault()
        openExternal(spec.url)
      }),
    )
    linkList.appendChild(linkElement)
    linkEntries.push({
      element: linkElement,
      searchText: `${categoryLabel} ${spec.title} ${spec.value} ${t('app.name')}`.toLowerCase(),
    })
  }

  resourcesGroup.itemsContainer.appendChild(linkList)
  root.appendChild(resourcesGroup.element)

  const systemGroup = createSettingsGroup(t('settings.aboutSystemInfo'))
  const infoGrid = $<HTMLDivElement>('div.settings-about-info-grid')
  const runtimeRows: RuntimeRowRef[] = []
  const systemEntries: SettingsRowEntry[] = []

  const runtimeSpecs: ReadonlyArray<{
    readonly key: RuntimeRowKey
    readonly label: string
    readonly initialValue: string
  }> = [
    {
      key: 'appVersion',
      label: t('settings.aboutVersionLabel'),
      initialValue: productService.version,
    },
    { key: 'electron', label: t('settings.aboutElectron'), initialValue: '—' },
    { key: 'chromium', label: t('settings.aboutChromium'), initialValue: '—' },
    { key: 'node', label: t('settings.aboutNode'), initialValue: '—' },
    { key: 'v8', label: t('settings.aboutV8'), initialValue: '—' },
    { key: 'os', label: t('settings.aboutOs'), initialValue: '—' },
    {
      key: 'license',
      label: t('settings.aboutLicense'),
      initialValue: t('settings.aboutLicenseValue'),
    },
  ]

  for (const spec of runtimeSpecs) {
    const valueElement = $<HTMLSpanElement>(
      'span.settings-about-info-value.selectable',
      undefined,
      spec.initialValue,
    )
    const rowElement = $<HTMLDivElement>(
      'div.settings-about-info-row',
      undefined,
      $<HTMLSpanElement>('span.settings-about-info-label', undefined, spec.label),
      valueElement,
    )
    infoGrid.appendChild(rowElement)
    runtimeRows.push({ key: spec.key, valueElement })
    systemEntries.push({
      element: rowElement,
      get searchText(): string {
        return `${categoryLabel} ${spec.label} ${valueElement.textContent ?? ''}`.toLowerCase()
      },
    })
  }

  systemGroup.itemsContainer.appendChild(infoGrid)
  root.appendChild(systemGroup.element)

  void nativeHostService
    .getRuntimeInfo()
    .then((info) => {
      if (store.isDisposed) {
        return
      }
      for (const row of runtimeRows) {
        if (row.key === 'license') {
          continue
        }
        row.valueElement.textContent =
          row.key === 'os' ? `${info.os} (${info.arch})` : info[row.key]
      }
    })
    .catch((error: unknown) => {
      logService.warn('AboutSettingsView', 'Runtime info could not be loaded.', error)
    })

  return {
    element: root,
    groups: [resourcesGroup.toEntry(linkEntries), systemGroup.toEntry(systemEntries)],
    dispose(): void {
      store.dispose()
    },
  }
}
