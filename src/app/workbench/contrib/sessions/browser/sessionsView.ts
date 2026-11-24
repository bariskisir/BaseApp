import './sessionsView.scss'
import { renderCodicon } from '@app/base/browser/codicons'
import { $, addDisposableListener, clearNode, toggleClass } from '@app/base/browser/dom'
import {
  type ActionBarItem,
  type ContextMenuItem,
  InputBox,
  attachTooltip,
} from '@app/base/browser/ui'
import { Emitter, type Event } from '@app/base/common/event'
import { formatDate } from '@app/base/common/formatters'
import { Disposable, DisposableStore } from '@app/base/common/lifecycle'
import type { ServicesAccessor } from '@app/platform/instantiation/common/instantiation'
import {
  MAX_SESSION_TITLE_LENGTH,
  type SessionSummary,
} from '@app/platform/sessions/common/sessions'
import type { IViewPane } from '@app/workbench/browser/viewPane'
import { IWorkbenchConfigurationService } from '@app/workbench/services/configuration/browser/workbenchConfigurationService'
import { IContextMenuService } from '@app/workbench/services/contextmenu/browser/contextMenuService'
import { IDialogService } from '@app/workbench/services/dialog/browser/dialogService'
import { IWorkbenchLayoutService } from '@app/workbench/services/layout/browser/layoutService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { IWorkbenchSessionsService } from '@app/workbench/services/sessions/browser/sessionsWorkbenchService'

export const SESSIONS_VIEW_ID = 'workbench.view.sessions'

export class SessionsView extends Disposable implements IViewPane {
  readonly id = SESSIONS_VIEW_ID
  readonly element: HTMLDivElement

  private readonly _onDidChangeHeaderActions = this._register(new Emitter<void>())
  readonly onDidChangeHeaderActions: Event<void> = this._onDidChangeHeaderActions.event

  private readonly listDisposables = this._register(new DisposableStore())
  private readonly searchWrap: HTMLDivElement
  private readonly searchInput: InputBox
  private readonly listContainer: HTMLDivElement
  private searchQuery = ''
  private deletingAll = false

  constructor(
    @IWorkbenchSessionsService private readonly sessionsService: IWorkbenchSessionsService,
    @IWorkbenchConfigurationService
    private readonly configurationService: IWorkbenchConfigurationService,
    @IWorkbenchLocalizationService
    private readonly localizationService: IWorkbenchLocalizationService,
    @IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
    @IDialogService private readonly dialogService: IDialogService,
    @IContextMenuService private readonly contextMenuService: IContextMenuService,
  ) {
    super()

    this.element = $<HTMLDivElement>('div.sessions-view')

    this.searchWrap = $<HTMLDivElement>('div.sessions-view-search')
    this.searchInput = this._register(
      new InputBox(this.searchWrap, {
        prefixIcon: 'search',
        allowClear: true,
        placeholder: this.localizationService.t('sessions.searchPlaceholder'),
        ariaLabel: this.localizationService.t('sessions.searchPlaceholder'),
      }),
    )
    this._register(
      this.searchInput.onDidChange((value) => {
        this.searchQuery = value
        this.renderList()
      }),
    )
    this._register(
      this.searchInput.onDidEscape(() => {
        if (this.searchQuery.length > 0) {
          this.searchQuery = ''
          this.searchInput.value = ''
          this.renderList()
        }
      }),
    )

    this.listContainer = $<HTMLDivElement>('div.sessions-view-list-container')

    this.element.appendChild(this.searchWrap)
    this.element.appendChild(this.listContainer)

    this._register(
      this.sessionsService.onDidChangeSessions(() => {
        this.syncSearchVisibility()
        this.renderList()
        this._onDidChangeHeaderActions.fire()
      }),
    )
    this._register(
      this.configurationService.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration('timeFormat') ||
          event.affectsConfiguration('dateFormat') ||
          event.affectsConfiguration('uiLanguage')
        ) {
          this.renderList()
        }
      }),
    )
    this._register(
      this.localizationService.onDidChangeLocale(() => {
        this.syncLabels()
        this.renderList()
        this._onDidChangeHeaderActions.fire()
      }),
    )

    this.syncLabels()
    this.syncSearchVisibility()
    this.renderList()
  }

  focus(): void {
    this.searchInput.focus()
  }

  getHeaderActions(): readonly ActionBarItem[] {
    const t = (key: string): string => this.localizationService.t(key)
    const sessions = this.sessionsService.sessions
    const deleteAllDisabled =
      this.deletingAll || sessions.length === 0 || this.sessionsService.isOnlyEmptySession

    return [
      {
        id: 'sessions-new',
        icon: 'add',
        title: t('sessions.newSession'),
        ariaLabel: t('sessions.newSession'),
        run: () => {
          this.layoutService.setPage('home')
          void this.sessionsService.createSession()
        },
      },
      {
        id: 'sessions-delete-all',
        icon: 'clear-all',
        title: t('sessions.deleteAll'),
        ariaLabel: t('sessions.deleteAll'),
        danger: true,
        disabled: deleteAllDisabled,
        run: () => {
          void this.confirmDeleteAll()
        },
      },
    ]
  }

  private getSessionTitle(session: SessionSummary): string {
    return session.isDefaultTitle
      ? this.localizationService.t('sessions.newSession')
      : session.title
  }

  private syncLabels(): void {
    const placeholder = this.localizationService.t('sessions.searchPlaceholder')
    this.searchInput.setPlaceholder(placeholder)
    this.searchInput.inputElement.setAttribute('aria-label', placeholder)
  }

  private syncSearchVisibility(): void {
    toggleClass(this.searchWrap, 'hidden', this.sessionsService.sessions.length === 0)
  }

  private renderList(): void {
    this.listDisposables.clear()
    clearNode(this.listContainer)

    const t = (key: string): string => this.localizationService.t(key)
    const sessions = this.sessionsService.sessions
    const uiLanguage = this.configurationService.getValue('uiLanguage')
    const timeFormat = this.configurationService.getValue('timeFormat')
    const dateFormat = this.configurationService.getValue('dateFormat')
    const currentSessionId = this.sessionsService.currentSession?.id ?? null
    const deletable = !this.sessionsService.isOnlyEmptySession

    if (sessions.length === 0) {
      this.listContainer.appendChild(
        $<HTMLDivElement>(
          'div.sessions-view-empty',
          undefined,
          renderCodicon('files', 24),
          $<HTMLSpanElement>('span', undefined, t('sessions.emptyTitle')),
        ),
      )
      return
    }

    const normalizedQuery = this.searchQuery.trim().toLocaleLowerCase(uiLanguage)
    const filtered =
      normalizedQuery.length === 0
        ? sessions
        : sessions.filter((session) =>
            this.getSessionTitle(session).toLocaleLowerCase(uiLanguage).includes(normalizedQuery),
          )

    if (filtered.length === 0) {
      this.listContainer.appendChild(
        $<HTMLDivElement>(
          'div.sessions-view-empty',
          undefined,
          renderCodicon('search', 24),
          $<HTMLSpanElement>('span', undefined, t('sessions.noSearchResults')),
        ),
      )
      return
    }

    const listElement = $<HTMLDivElement>('div.sessions-view-list', {
      role: 'list',
    })

    for (const session of filtered) {
      const active = session.id === currentSessionId
      const titleText = this.getSessionTitle(session)
      const timestampText = formatDate(session.updatedAt, timeFormat, dateFormat, uiLanguage)

      const row = $<HTMLDivElement>('div.sidebar-session-row', {
        role: 'listitem',
      })
      toggleClass(row, 'active', active)

      const titleRow = $<HTMLSpanElement>('span.sidebar-session-title-row')
      if (session.pinned) {
        const pinLabel = t('sessions.pinned')
        const pinBadge = $<HTMLSpanElement>(
          'span.sidebar-session-pin',
          { role: 'img', 'aria-label': pinLabel },
          renderCodicon('pinned', 11),
        )
        this.listDisposables.add(attachTooltip(pinBadge, pinLabel))
        titleRow.appendChild(pinBadge)
      }
      titleRow.appendChild($<HTMLSpanElement>('span.sidebar-session-title', undefined, titleText))

      const body = $<HTMLSpanElement>(
        'span.sidebar-session-body',
        undefined,
        titleRow,
        $<HTMLSpanElement>('span.sidebar-session-meta', undefined, timestampText),
      )

      const openButton = $<HTMLButtonElement>(
        'button.sidebar-session-open',
        {
          type: 'button',
          'aria-current': active ? 'true' : undefined,
        },
        $<HTMLSpanElement>('span.sidebar-session-icon', undefined, renderCodicon('files', 14)),
        body,
      )

      const deleteLabel = t('common.delete')
      const deleteButton = $<HTMLButtonElement>(
        'button.sidebar-session-delete',
        {
          type: 'button',
          'aria-label': deleteLabel,
          disabled: !deletable,
        },
        renderCodicon('trash', 14),
      )

      if (deletable) {
        this.listDisposables.add(attachTooltip(deleteButton, deleteLabel))
      }

      this.listDisposables.add(
        addDisposableListener(openButton, 'click', () => {
          this.layoutService.setPage('home')
          void this.sessionsService.openSession(session.id)
        }),
      )

      this.listDisposables.add(
        addDisposableListener(openButton, 'dblclick', () => {
          void this.promptRename(session)
        }),
      )

      this.listDisposables.add(
        addDisposableListener(deleteButton, 'click', (event) => {
          event.stopPropagation()
          if (!deletable) {
            return
          }
          void this.sessionsService.deleteSession(session.id)
        }),
      )

      this.listDisposables.add(
        addDisposableListener(row, 'contextmenu', (event) => {
          event.preventDefault()
          event.stopPropagation()
          const items: ContextMenuItem[] = [
            {
              id: 'pin',
              icon: session.pinned ? 'pinned' : 'pin',
              label: t(session.pinned ? 'sessions.unpin' : 'sessions.pin'),
              run: () => {
                void this.sessionsService.toggleSessionPinned(session.id, !session.pinned)
              },
            },
            {
              id: 'rename',
              icon: 'edit',
              label: t('common.rename'),
              run: () => {
                void this.promptRename(session)
              },
            },
            { type: 'separator' },
            {
              id: 'delete',
              icon: 'trash',
              label: t('common.delete'),
              danger: true,
              disabled: !deletable,
              run: () => {
                void this.sessionsService.deleteSession(session.id)
              },
            },
          ]
          this.contextMenuService.showContextMenu({ x: event.clientX, y: event.clientY }, items)
        }),
      )

      row.appendChild(openButton)
      row.appendChild(deleteButton)
      listElement.appendChild(row)
    }

    this.listContainer.appendChild(listElement)
  }

  private async promptRename(session: SessionSummary): Promise<void> {
    const t = (key: string): string => this.localizationService.t(key)
    const nextTitle = await this.dialogService.prompt({
      title: t('sessions.renameSession'),
      initialValue: this.getSessionTitle(session),
      confirmLabel: t('common.save'),
      cancelLabel: t('common.cancel'),
      validate: (value) => {
        const trimmed = value.trim()
        return trimmed.length > 0 && trimmed.length <= MAX_SESSION_TITLE_LENGTH
      },
    })
    if (nextTitle === null || this.isDisposed) {
      return
    }
    const trimmed = nextTitle.trim()
    if (trimmed.length === 0) {
      return
    }
    await this.sessionsService.renameSession(session.id, trimmed)
  }

  private async confirmDeleteAll(): Promise<void> {
    if (
      this.deletingAll ||
      this.sessionsService.sessions.length === 0 ||
      this.sessionsService.isOnlyEmptySession
    ) {
      return
    }
    const t = (key: string): string => this.localizationService.t(key)
    const confirmed = await this.dialogService.confirm({
      title: t('sessions.deleteAllConfirmTitle'),
      detail: t('sessions.deleteAllConfirmDescription'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      danger: true,
      severity: 'warning',
    })
    if (!confirmed || this.isDisposed) {
      return
    }
    this.deletingAll = true
    this._onDidChangeHeaderActions.fire()
    try {
      await this.sessionsService.deleteAllSessions()
      this.searchQuery = ''
      this.searchInput.value = ''
      this.renderList()
    } finally {
      this.deletingAll = false
      this._onDidChangeHeaderActions.fire()
    }
  }
}

export function createSessionsView(accessor: ServicesAccessor): IViewPane {
  return new SessionsView(
    accessor.get(IWorkbenchSessionsService),
    accessor.get(IWorkbenchConfigurationService),
    accessor.get(IWorkbenchLocalizationService),
    accessor.get(IWorkbenchLayoutService),
    accessor.get(IDialogService),
    accessor.get(IContextMenuService),
  )
}
