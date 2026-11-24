import './startupOverlay.scss'
import { renderCodicon } from '@app/base/browser/codicons'
import { $, clearNode, toggleClass } from '@app/base/browser/dom'
import { Button } from '@app/base/browser/ui'
import { Disposable, DisposableStore, toDisposable } from '@app/base/common/lifecycle'
import { APP_LOGO_URL } from '@app/workbench/browser/assets/brand'

export class StartupOverlay extends Disposable {
  readonly element: HTMLDivElement
  private readonly statusRow: HTMLDivElement
  private readonly actionsContainer: HTMLDivElement
  private readonly actionDisposables = this._register(new DisposableStore())

  constructor(container: HTMLElement) {
    super()

    const logo = $<HTMLImageElement>('img.startup-overlay-logo', {
      src: APP_LOGO_URL,
      alt: '',
    })
    this.statusRow = $<HTMLDivElement>('div.startup-overlay-status')
    this.actionsContainer = $<HTMLDivElement>('div.startup-overlay-actions')
    this.element = $<HTMLDivElement>(
      'div.startup-overlay',
      undefined,
      logo,
      this.statusRow,
      this.actionsContainer,
    )

    container.appendChild(this.element)
    this._register(toDisposable(() => this.element.remove()))
  }

  showLoading(message: string): void {
    this.actionDisposables.clear()
    clearNode(this.statusRow)
    clearNode(this.actionsContainer)
    this.element.removeAttribute('role')
    toggleClass(this.element, 'hidden', false)
    toggleClass(this.statusRow, 'error', false)
    this.statusRow.appendChild(renderCodicon('loading', 16))
    this.statusRow.appendChild($<HTMLSpanElement>('span', undefined, message))
  }

  showError(message: string, retryLabel: string, onRetry: () => void): void {
    this.actionDisposables.clear()
    clearNode(this.statusRow)
    clearNode(this.actionsContainer)
    this.element.setAttribute('role', 'alert')
    toggleClass(this.element, 'hidden', false)
    toggleClass(this.statusRow, 'error', true)
    this.statusRow.appendChild(renderCodicon('error', 16))
    this.statusRow.appendChild($<HTMLSpanElement>('span', undefined, message))

    const retryButton = this.actionDisposables.add(
      new Button(this.actionsContainer, {
        label: retryLabel,
        icon: 'refresh',
        variant: 'primary',
      }),
    )
    this.actionDisposables.add(retryButton.onDidClick(() => onRetry()))
  }

  hide(): void {
    this.actionDisposables.clear()
    clearNode(this.actionsContainer)
    toggleClass(this.element, 'hidden', true)
  }
}
