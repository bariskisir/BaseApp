import './welcomeEditorView.scss'
import { type CodiconName, renderCodicon, setCodicon } from '@app/base/browser/codicons'
import { $, addDisposableListener } from '@app/base/browser/dom'
import { Disposable } from '@app/base/common/lifecycle'
import { APP_LOGO_URL } from '@app/workbench/browser/assets/brand'
import { IWorkbenchLayoutService } from '@app/workbench/services/layout/browser/layoutService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { IWorkbenchSessionsService } from '@app/workbench/services/sessions/browser/sessionsWorkbenchService'

interface FeatureTileSpec {
  readonly icon: CodiconName
  readonly titleKey: string
  readonly descriptionKey: string
}

const FEATURE_TILES: readonly FeatureTileSpec[] = [
  {
    icon: 'window',
    titleKey: 'workspace.shellTitle',
    descriptionKey: 'workspace.shellDescription',
  },
  {
    icon: 'files',
    titleKey: 'workspace.sessionsTitle',
    descriptionKey: 'workspace.sessionsDescription',
  },
  {
    icon: 'shield',
    titleKey: 'workspace.securityTitle',
    descriptionKey: 'workspace.securityDescription',
  },
]

interface FeatureTileRefs {
  readonly spec: FeatureTileSpec
  readonly titleElement: HTMLElement
  readonly descriptionElement: HTMLElement
}

export class WelcomeEditorView extends Disposable {
  readonly element: HTMLElement

  private readonly titleElement: HTMLHeadingElement
  private readonly descriptionElement: HTMLParagraphElement
  private readonly newSessionLabel: HTMLSpanElement
  private readonly settingsLabel: HTMLSpanElement
  private readonly compactIcon: HTMLSpanElement
  private readonly compactLabel: HTMLSpanElement
  private readonly tiles: FeatureTileRefs[] = []

  constructor(
    @IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
    @IWorkbenchSessionsService private readonly sessionsService: IWorkbenchSessionsService,
    @IWorkbenchLocalizationService
    private readonly localizationService: IWorkbenchLocalizationService,
  ) {
    super()

    this.element = $<HTMLElement>('section.welcome-editor')
    const inner = $<HTMLDivElement>('div.welcome-editor-inner')

    const header = $<HTMLDivElement>('div.welcome-header')
    const logo = $<HTMLImageElement>('img.welcome-logo', {
      src: APP_LOGO_URL,
      alt: '',
    })
    const headerText = $<HTMLDivElement>('div.welcome-header-text')
    this.titleElement = $<HTMLHeadingElement>('h1.welcome-title')
    this.descriptionElement = $<HTMLParagraphElement>('p.welcome-description')
    headerText.appendChild(this.titleElement)
    headerText.appendChild(this.descriptionElement)
    header.appendChild(logo)
    header.appendChild(headerText)

    const actionsRow = $<HTMLDivElement>('div.welcome-actions')

    this.newSessionLabel = $<HTMLSpanElement>('span.welcome-action-label')
    const newSessionButton = $<HTMLButtonElement>(
      'button.welcome-action-link',
      { type: 'button' },
      renderCodicon('add', 16),
      this.newSessionLabel,
    )
    this._register(
      addDisposableListener(newSessionButton, 'click', () => {
        void this.sessionsService.createSession()
      }),
    )

    this.settingsLabel = $<HTMLSpanElement>('span.welcome-action-label')
    const settingsButton = $<HTMLButtonElement>(
      'button.welcome-action-link',
      { type: 'button' },
      renderCodicon('settings-gear', 16),
      this.settingsLabel,
    )
    this._register(
      addDisposableListener(settingsButton, 'click', () => {
        this.layoutService.openSettings()
      }),
    )

    this.compactIcon = renderCodicon('screen-full', 16)
    this.compactLabel = $<HTMLSpanElement>('span.welcome-action-label')
    const compactButton = $<HTMLButtonElement>(
      'button.welcome-action-link',
      { type: 'button' },
      this.compactIcon,
      this.compactLabel,
    )
    this._register(
      addDisposableListener(compactButton, 'click', () => {
        this.layoutService.toggleCompactMode()
      }),
    )

    actionsRow.appendChild(newSessionButton)
    actionsRow.appendChild(settingsButton)
    actionsRow.appendChild(compactButton)

    const tilesGrid = $<HTMLDivElement>('div.welcome-tiles')
    for (const spec of FEATURE_TILES) {
      const tileTitle = $<HTMLElement>('strong.welcome-tile-title')
      const tileDescription = $<HTMLSpanElement>('span.welcome-tile-description')
      const tileBody = $<HTMLDivElement>(
        'div.welcome-tile-body',
        undefined,
        tileTitle,
        tileDescription,
      )
      const tileIcon = $<HTMLDivElement>(
        'div.welcome-tile-icon',
        undefined,
        renderCodicon(spec.icon, 20),
      )
      const tile = $<HTMLElement>('article.welcome-tile', undefined, tileIcon, tileBody)
      tilesGrid.appendChild(tile)
      this.tiles.push({
        spec,
        titleElement: tileTitle,
        descriptionElement: tileDescription,
      })
    }

    inner.appendChild(header)
    inner.appendChild(actionsRow)
    inner.appendChild(tilesGrid)
    this.element.appendChild(inner)

    this.syncCopy()
    this.syncCompactAction()

    this._register(
      this.localizationService.onDidChangeLocale(() => {
        this.syncCopy()
        this.syncCompactAction()
      }),
    )
    this._register(
      this.layoutService.onDidChangeLayout(() => {
        this.syncCompactAction()
      }),
    )
  }

  private syncCopy(): void {
    const t = (key: string): string => this.localizationService.t(key)
    this.titleElement.textContent = t('workspace.title')
    this.descriptionElement.textContent = t('workspace.description')
    this.newSessionLabel.textContent = t('sessions.newSession')
    this.settingsLabel.textContent = t('nav.settings')
    for (const tile of this.tiles) {
      tile.titleElement.textContent = t(tile.spec.titleKey)
      tile.descriptionElement.textContent = t(tile.spec.descriptionKey)
    }
  }

  private syncCompactAction(): void {
    const isCompact = this.layoutService.compactMode
    setCodicon(this.compactIcon, isCompact ? 'screen-normal' : 'screen-full', 16)
    this.compactLabel.textContent = this.localizationService.t(
      isCompact ? 'workspace.fullView' : 'workspace.compactView',
    )
  }
}
