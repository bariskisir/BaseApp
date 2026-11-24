import './dialog.scss'
import { DisposableStore, toDisposable } from '@app/base/common/lifecycle'
import { type CodiconName, renderCodicon } from '../../codicons'
import { $, addDisposableListener, isHTMLElement } from '../../dom'
import { Button } from '../button/button'
import { InputBox } from '../inputbox/inputBox'
import { hideActiveTooltip } from '../tooltip/tooltip'

export type DialogSeverity = 'info' | 'warning' | 'error'

export interface ConfirmDialogOptions {
  readonly title: string
  readonly detail?: string | undefined
  readonly confirmLabel: string
  readonly cancelLabel: string
  readonly danger?: boolean | undefined
  readonly severity?: DialogSeverity | undefined
}

export interface PromptDialogOptions {
  readonly title: string
  readonly detail?: string | undefined
  readonly initialValue?: string | undefined
  readonly placeholder?: string | undefined
  readonly confirmLabel: string
  readonly cancelLabel: string
  readonly validate?: ((value: string) => boolean) | undefined
}

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'

let nextDialogId = 1

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const nodes = container.querySelectorAll(FOCUSABLE_SELECTOR)
  const focusable: HTMLElement[] = []
  for (const node of nodes) {
    if (isHTMLElement(node)) {
      focusable.push(node)
    }
  }
  return focusable
}

function handleFocusTrapKeydown(dialogBox: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== 'Tab') {
    return
  }
  const focusable = getFocusableElements(dialogBox)
  if (focusable.length === 0) {
    event.preventDefault()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) {
    return
  }
  const active = document.activeElement
  if (event.shiftKey) {
    if (active === first || !dialogBox.contains(active)) {
      event.preventDefault()
      last.focus()
    }
  } else if (active === last || !dialogBox.contains(active)) {
    event.preventDefault()
    first.focus()
  }
}

interface DialogFrame {
  readonly modalBlock: HTMLDivElement
  readonly dialogBox: HTMLDivElement
  readonly contentElement: HTMLDivElement
  readonly buttonsElement: HTMLDivElement
  readonly closeButton: HTMLButtonElement
}

function createDialogFrame(
  title: string,
  detail: string | undefined,
  iconName: CodiconName,
  severity: DialogSeverity,
): DialogFrame {
  const titleId = `monaco-dialog-title-${nextDialogId}`
  const detailId = `monaco-dialog-detail-${nextDialogId}`
  nextDialogId += 1

  const closeButton = $<HTMLButtonElement>(
    'button.monaco-dialog-close',
    {
      type: 'button',
      'aria-label': 'Close',
    },
    renderCodicon('close', 16),
  )

  const iconContainer = $<HTMLDivElement>(
    'div.monaco-dialog-icon',
    { class: `severity-${severity}` },
    renderCodicon(iconName, 24),
  )

  const titleElement = $<HTMLHeadingElement>('h2.monaco-dialog-title', { id: titleId }, title)
  const contentElement = $<HTMLDivElement>('div.monaco-dialog-content', undefined, titleElement)

  if (detail !== undefined && detail.length > 0) {
    contentElement.appendChild(
      $<HTMLParagraphElement>('p.monaco-dialog-detail', { id: detailId }, detail),
    )
  }

  const bodyElement = $<HTMLDivElement>(
    'div.monaco-dialog-body',
    undefined,
    iconContainer,
    contentElement,
  )
  const buttonsElement = $<HTMLDivElement>('div.monaco-dialog-buttons')

  const dialogBox = $<HTMLDivElement>(
    'div.monaco-dialog-box',
    {
      role: 'dialog',
      'aria-modal': true,
      'aria-labelledby': titleId,
      'aria-describedby': detail !== undefined && detail.length > 0 ? detailId : undefined,
      tabindex: '-1',
    },
    closeButton,
    bodyElement,
    buttonsElement,
  )

  const modalBlock = $<HTMLDivElement>('div.monaco-dialog-modal-block.dimmed', undefined, dialogBox)

  return { modalBlock, dialogBox, contentElement, buttonsElement, closeButton }
}

export function showConfirmDialog(
  options: ConfirmDialogOptions,
  container: HTMLElement = document.body,
): Promise<boolean> {
  hideActiveTooltip()

  return new Promise<boolean>((resolve) => {
    const previouslyFocused = isHTMLElement(document.activeElement) ? document.activeElement : null
    const store = new DisposableStore()
    const severity: DialogSeverity = options.severity ?? (options.danger ? 'warning' : 'info')
    const frame = createDialogFrame(options.title, options.detail, severity, severity)

    let settled = false
    const finish = (result: boolean): void => {
      if (settled) {
        return
      }
      settled = true
      store.dispose()
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus()
      }
      resolve(result)
    }

    const cancelButton = store.add(
      new Button(frame.buttonsElement, {
        label: options.cancelLabel,
        variant: 'secondary',
      }),
    )
    const confirmButton = store.add(
      new Button(frame.buttonsElement, {
        label: options.confirmLabel,
        variant: options.danger ? 'danger' : 'primary',
      }),
    )

    store.add(cancelButton.onDidClick(() => finish(false)))
    store.add(confirmButton.onDidClick(() => finish(true)))
    store.add(addDisposableListener(frame.closeButton, 'click', () => finish(false)))
    store.add(
      addDisposableListener(frame.modalBlock, 'mousedown', (event) => {
        if (event.target === frame.modalBlock) {
          finish(false)
        }
      }),
    )
    store.add(
      addDisposableListener(frame.dialogBox, 'keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          finish(false)
          return
        }
        handleFocusTrapKeydown(frame.dialogBox, event)
      }),
    )
    store.add(toDisposable(() => frame.modalBlock.remove()))

    container.appendChild(frame.modalBlock)
    if (options.danger) {
      cancelButton.focus()
    } else {
      confirmButton.focus()
    }
  })
}

export function showPromptDialog(
  options: PromptDialogOptions,
  container: HTMLElement = document.body,
): Promise<string | null> {
  hideActiveTooltip()

  return new Promise<string | null>((resolve) => {
    const previouslyFocused = isHTMLElement(document.activeElement) ? document.activeElement : null
    const store = new DisposableStore()
    const frame = createDialogFrame(options.title, options.detail, 'edit', 'info')

    const inputContainer = $<HTMLDivElement>('div.monaco-dialog-input-container')
    frame.contentElement.appendChild(inputContainer)

    const inputBox = store.add(
      new InputBox(inputContainer, {
        value: options.initialValue,
        placeholder: options.placeholder,
        ariaLabel: options.placeholder ?? options.title,
      }),
    )

    let settled = false
    const finish = (result: string | null): void => {
      if (settled) {
        return
      }
      settled = true
      store.dispose()
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus()
      }
      resolve(result)
    }

    const cancelButton = store.add(
      new Button(frame.buttonsElement, {
        label: options.cancelLabel,
        variant: 'secondary',
      }),
    )
    const confirmButton = store.add(
      new Button(frame.buttonsElement, {
        label: options.confirmLabel,
        variant: 'primary',
      }),
    )

    const isValid = (value: string): boolean => (options.validate ? options.validate(value) : true)
    const syncValidity = (): void => {
      confirmButton.setEnabled(isValid(inputBox.value))
    }
    syncValidity()

    const submit = (): void => {
      if (!isValid(inputBox.value)) {
        return
      }
      finish(inputBox.value)
    }

    store.add(inputBox.onDidChange(() => syncValidity()))
    store.add(inputBox.onDidSubmit(() => submit()))
    store.add(inputBox.onDidEscape(() => finish(null)))
    store.add(cancelButton.onDidClick(() => finish(null)))
    store.add(confirmButton.onDidClick(() => submit()))
    store.add(addDisposableListener(frame.closeButton, 'click', () => finish(null)))
    store.add(
      addDisposableListener(frame.modalBlock, 'mousedown', (event) => {
        if (event.target === frame.modalBlock) {
          finish(null)
        }
      }),
    )
    store.add(
      addDisposableListener(frame.dialogBox, 'keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          finish(null)
          return
        }
        handleFocusTrapKeydown(frame.dialogBox, event)
      }),
    )
    store.add(toDisposable(() => frame.modalBlock.remove()))

    container.appendChild(frame.modalBlock)
    inputBox.focus()
    inputBox.select()
  })
}
