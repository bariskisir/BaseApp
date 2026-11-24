import './notificationsPart.scss'
import { type CodiconName, renderCodicon } from '@app/base/browser/codicons'
import { $, addDisposableListener, clearNode } from '@app/base/browser/dom'
import { Button, ProgressBar, attachTooltip } from '@app/base/browser/ui'
import { DisposableStore, toDisposable } from '@app/base/common/lifecycle'
import { INativeHostService } from '@app/platform/native/common/native'
import type { UpdateStateEvent } from '@app/platform/update/common/update'
import { Part } from '@app/workbench/browser/part'
import { Parts } from '@app/workbench/services/layout/browser/layoutService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { IWorkbenchLogService } from '@app/workbench/services/log/browser/rendererLogService'
import {
  type INotificationMessage,
  INotificationService,
  type NotificationSeverity,
} from '@app/workbench/services/notification/browser/notificationService'
import { IWorkbenchUpdateService } from '@app/workbench/services/update/browser/updateWorkbenchService'

const AUTO_DISMISS_MS = 4_000

function severityToIcon(severity: NotificationSeverity): CodiconName {
  switch (severity) {
    case 'success':
      return 'pass'
    case 'warning':
      return 'warning'
    case 'error':
      return 'error'
    default:
      return 'info'
  }
}

export class NotificationsPart extends Part {
  protected readonly partClassName = 'notifications'

  private readonly transientToasts = new Set<DisposableStore>()
  private readonly updateToastDisposables = this._register(new DisposableStore())
  private transientSlot: HTMLDivElement | undefined
  private updateSlot: HTMLDivElement | undefined
  private activeUpdateToastState: UpdateStateEvent['state'] | null = null
  private activeUpdateMessage: HTMLSpanElement | undefined
  private activeUpdateProgressBar: ProgressBar | undefined
  private dismissedUpdateKey: string | null = null

  constructor(
    @INotificationService private readonly notificationService: INotificationService,
    @IWorkbenchUpdateService private readonly updateService: IWorkbenchUpdateService,
    @IWorkbenchLocalizationService
    private readonly localizationService: IWorkbenchLocalizationService,
    @INativeHostService private readonly nativeHostService: INativeHostService,
    @IWorkbenchLogService private readonly logService: IWorkbenchLogService,
  ) {
    super(Parts.NotificationsPart)
  }

  protected createContentArea(parent: HTMLElement): void {
    this.updateSlot = $<HTMLDivElement>('div.notifications-update-slot')
    this.transientSlot = $<HTMLDivElement>('div.notifications-transient-slot')
    const toastsContainer = $<HTMLDivElement>(
      'div.notifications-toasts',
      { 'aria-live': 'polite' },
      this.updateSlot,
      this.transientSlot,
    )
    parent.appendChild(toastsContainer)

    this._register(
      this.notificationService.onDidNotify((message) => {
        this.addTransientToast(message)
      }),
    )

    this._register(
      this.updateService.onDidChangeState((state) => {
        this.syncUpdateToast(state, false)
      }),
    )

    this._register(
      this.localizationService.onDidChangeLocale(() => {
        this.syncUpdateToast(this.updateService.state, true)
      }),
    )

    this._register(
      toDisposable(() => {
        for (const store of this.transientToasts) {
          store.dispose()
        }
        this.transientToasts.clear()
      }),
    )

    this.syncUpdateToast(this.updateService.state, true)
  }

  private addTransientToast(message: INotificationMessage): void {
    if (!this.transientSlot || this.isDisposed) {
      return
    }

    const store = new DisposableStore()
    this.transientToasts.add(store)

    const dismissLabel = this.localizationService.t('common.dismiss')
    const iconElement = $<HTMLSpanElement>(
      'span.notification-toast-icon',
      { class: `severity-${message.severity}` },
      renderCodicon(severityToIcon(message.severity), 16),
    )
    const textElement = $<HTMLSpanElement>(
      'span.notification-toast-message',
      undefined,
      message.text,
    )
    const dismissButton = $<HTMLButtonElement>(
      'button.notification-toast-dismiss',
      {
        type: 'button',
        'aria-label': dismissLabel,
      },
      renderCodicon('close', 14),
    )
    store.add(attachTooltip(dismissButton, dismissLabel))

    const mainRow = $<HTMLDivElement>(
      'div.notification-toast-main',
      undefined,
      iconElement,
      textElement,
      dismissButton,
    )
    const toast = $<HTMLDivElement>(
      'div.notification-toast',
      { role: message.severity === 'error' ? 'alert' : 'status' },
      mainRow,
    )

    let timerId: ReturnType<typeof setTimeout> | null = null
    const clearTimer = (): void => {
      if (timerId !== null) {
        clearTimeout(timerId)
        timerId = null
      }
    }

    const removeToast = (): void => {
      clearTimer()
      this.transientToasts.delete(store)
      store.dispose()
    }

    const scheduleDismiss = (): void => {
      clearTimer()
      timerId = setTimeout(removeToast, AUTO_DISMISS_MS)
    }

    store.add(addDisposableListener(dismissButton, 'click', removeToast))
    store.add(addDisposableListener(toast, 'mouseenter', clearTimer))
    store.add(addDisposableListener(toast, 'mouseleave', scheduleDismiss))
    store.add(
      toDisposable(() => {
        clearTimer()
        toast.remove()
      }),
    )

    this.transientSlot.appendChild(toast)
    scheduleDismiss()
  }

  private syncUpdateToast(update: UpdateStateEvent, forceRebuild: boolean): void {
    if (!this.updateSlot || this.isDisposed) {
      return
    }

    const shouldShow =
      update.state === 'available' ||
      update.state === 'downloading' ||
      update.state === 'downloaded' ||
      update.state === 'error'

    const noticeKey = `${update.state}:${update.version ?? ''}`
    if (!shouldShow || this.dismissedUpdateKey === noticeKey) {
      this.clearUpdateToast()
      return
    }

    if (
      !forceRebuild &&
      update.state === 'downloading' &&
      this.activeUpdateToastState === 'downloading' &&
      this.activeUpdateMessage &&
      this.activeUpdateProgressBar
    ) {
      this.activeUpdateMessage.textContent = this.localizationService.t('settings.downloading', {
        percent: Math.round(update.percent ?? 0),
      })
      if (update.percent !== undefined) {
        this.activeUpdateProgressBar.setProgress(update.percent)
      } else {
        this.activeUpdateProgressBar.setIndeterminate(true)
      }
      return
    }

    this.clearUpdateToast()

    const t = (key: string, options?: Record<string, unknown>): string =>
      this.localizationService.t(key, options)

    let iconName: CodiconName = 'cloud-download'
    let severity: NotificationSeverity = 'info'
    let messageText = ''

    switch (update.state) {
      case 'available':
        iconName = 'cloud-download'
        severity = 'info'
        messageText = t('settings.updateAvailable', { version: update.version ?? '' })
        break
      case 'downloading':
        iconName = 'cloud-download'
        severity = 'info'
        messageText = t('settings.downloading', { percent: Math.round(update.percent ?? 0) })
        break
      case 'downloaded':
        iconName = 'pass'
        severity = 'success'
        messageText = t('settings.readyToInstall', { version: update.version ?? '' })
        break
      case 'error':
        iconName = 'error'
        severity = 'error'
        messageText = update.message
          ? `${t('settings.updateError')}: ${update.message}`
          : t('settings.updateError')
        break
      default:
        return
    }

    const dismissLabel = t('common.dismiss')
    const iconElement = $<HTMLSpanElement>(
      'span.notification-toast-icon',
      { class: `severity-${severity}` },
      renderCodicon(iconName, 16),
    )
    const textElement = $<HTMLSpanElement>(
      'span.notification-toast-message',
      undefined,
      messageText,
    )
    const dismissButton = $<HTMLButtonElement>(
      'button.notification-toast-dismiss',
      {
        type: 'button',
        'aria-label': dismissLabel,
      },
      renderCodicon('close', 14),
    )
    this.updateToastDisposables.add(attachTooltip(dismissButton, dismissLabel))
    this.updateToastDisposables.add(
      addDisposableListener(dismissButton, 'click', () => {
        this.dismissedUpdateKey = noticeKey
        this.clearUpdateToast()
      }),
    )

    const mainRow = $<HTMLDivElement>(
      'div.notification-toast-main',
      undefined,
      iconElement,
      textElement,
      dismissButton,
    )
    const toast = $<HTMLDivElement>(
      'div.notification-toast',
      { role: update.state === 'error' ? 'alert' : 'status' },
      mainRow,
    )

    if (update.state === 'downloading') {
      const progressContainer = $<HTMLDivElement>('div.notification-toast-progress')
      const progressBar = this.updateToastDisposables.add(new ProgressBar(progressContainer))
      if (update.percent !== undefined) {
        progressBar.setProgress(update.percent)
      } else {
        progressBar.setIndeterminate(true)
      }
      toast.appendChild(progressContainer)
      this.activeUpdateProgressBar = progressBar
    }

    if (update.state === 'downloaded') {
      const actions = $<HTMLDivElement>('div.notification-toast-actions')
      const installButton = this.updateToastDisposables.add(
        new Button(actions, {
          label: t('settings.installNow'),
          variant: 'primary',
          small: true,
        }),
      )
      this.updateToastDisposables.add(
        installButton.onDidClick(() => {
          void this.updateService.installUpdate()
        }),
      )
      toast.appendChild(actions)
    } else if (update.state === 'available' && update.pageUrl) {
      const pageUrl = update.pageUrl
      const actions = $<HTMLDivElement>('div.notification-toast-actions')
      const downloadButton = this.updateToastDisposables.add(
        new Button(actions, {
          label: t('settings.openDownloadPage'),
          variant: 'primary',
          small: true,
        }),
      )
      this.updateToastDisposables.add(
        downloadButton.onDidClick(() => {
          void this.nativeHostService.openExternal(pageUrl).catch((error: unknown) => {
            this.logService.error('NotificationsPart', 'External URL could not be opened.', error)
            this.notificationService.error(this.localizationService.t('errors.generic'))
          })
        }),
      )
      toast.appendChild(actions)
    }

    this.activeUpdateToastState = update.state
    this.activeUpdateMessage = textElement
    this.updateSlot.appendChild(toast)
  }

  private clearUpdateToast(): void {
    this.updateToastDisposables.clear()
    this.activeUpdateToastState = null
    this.activeUpdateMessage = undefined
    this.activeUpdateProgressBar = undefined
    if (this.updateSlot) {
      clearNode(this.updateSlot)
    }
  }
}
