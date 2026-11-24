import './tooltip.scss'
import {
  DisposableStore,
  type IDisposable,
  markAsSingleton,
  toDisposable,
} from '@app/base/common/lifecycle'
import { clamp } from '@app/base/common/number'
import { $, addDisposableListener } from '../../dom'

const TOOLTIP_DELAY_MS = 380
const TOOLTIP_OFFSET_PX = 6
const VIEWPORT_PADDING_PX = 8

type TooltipTextSource = string | (() => string | undefined)

class TooltipController {
  private tooltipElement: HTMLDivElement | null = null
  private activeTarget: HTMLElement | null = null
  private pendingTarget: HTMLElement | null = null
  private showTimer: ReturnType<typeof setTimeout> | undefined
  private globalListeners: DisposableStore | null = null

  private ensureElement(): HTMLDivElement {
    if (!this.tooltipElement) {
      this.tooltipElement = $<HTMLDivElement>('div.monaco-tooltip', {
        role: 'tooltip',
        'aria-hidden': true,
      })
    }
    if (!this.tooltipElement.isConnected && document.body) {
      document.body.appendChild(this.tooltipElement)
    }
    return this.tooltipElement
  }

  private ensureGlobalListeners(): void {
    if (this.globalListeners) {
      return
    }
    const store = markAsSingleton(new DisposableStore())
    store.add(
      addDisposableListener(
        window,
        'scroll',
        () => {
          this.hide()
        },
        true,
      ),
    )
    store.add(
      addDisposableListener(window, 'resize', () => {
        this.hide()
      }),
    )
    store.add(
      addDisposableListener(window, 'blur', () => {
        this.hide()
      }),
    )
    store.add(
      addDisposableListener(document, 'keydown', (event) => {
        if (event.key === 'Escape') {
          this.hide()
        }
      }),
    )
    this.globalListeners = store
  }

  private clearTimer(): void {
    if (this.showTimer !== undefined) {
      clearTimeout(this.showTimer)
      this.showTimer = undefined
    }
    this.pendingTarget = null
  }

  scheduleShow(target: HTMLElement, textOrGetter: TooltipTextSource): void {
    this.clearTimer()
    this.pendingTarget = target
    this.showTimer = setTimeout(() => {
      this.showTimer = undefined
      if (this.pendingTarget !== target) {
        return
      }
      this.pendingTarget = null
      this.showNow(target, textOrGetter)
    }, TOOLTIP_DELAY_MS)
  }

  showNow(target: HTMLElement, textOrGetter: TooltipTextSource): void {
    if (!target.isConnected) {
      this.hide()
      return
    }
    const resolved = typeof textOrGetter === 'function' ? textOrGetter() : textOrGetter
    const text = resolved?.trim()
    if (!text) {
      this.hide()
      return
    }

    this.ensureGlobalListeners()
    const element = this.ensureElement()
    element.textContent = text
    element.style.left = '0px'
    element.style.top = '0px'
    element.classList.add('visible')
    element.setAttribute('aria-hidden', 'false')
    this.activeTarget = target

    const targetRect = target.getBoundingClientRect()
    const tipRect = element.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let top = targetRect.bottom + TOOLTIP_OFFSET_PX
    if (top + tipRect.height + VIEWPORT_PADDING_PX > viewportHeight) {
      const aboveTop = targetRect.top - tipRect.height - TOOLTIP_OFFSET_PX
      if (aboveTop >= VIEWPORT_PADDING_PX) {
        top = aboveTop
      }
    }
    top = clamp(
      top,
      VIEWPORT_PADDING_PX,
      Math.max(VIEWPORT_PADDING_PX, viewportHeight - tipRect.height - VIEWPORT_PADDING_PX),
    )

    const centeredLeft = targetRect.left + (targetRect.width - tipRect.width) / 2
    const left = clamp(
      centeredLeft,
      VIEWPORT_PADDING_PX,
      Math.max(VIEWPORT_PADDING_PX, viewportWidth - tipRect.width - VIEWPORT_PADDING_PX),
    )

    element.style.left = `${Math.round(left)}px`
    element.style.top = `${Math.round(top)}px`
  }

  hideFor(target: HTMLElement): void {
    if (this.pendingTarget === target) {
      this.clearTimer()
    }
    if (this.activeTarget === target) {
      this.hide()
    }
  }

  hide(): void {
    this.clearTimer()
    this.activeTarget = null
    if (this.tooltipElement) {
      this.tooltipElement.classList.remove('visible')
      this.tooltipElement.setAttribute('aria-hidden', 'true')
    }
  }
}

const tooltipController = new TooltipController()

export function hideActiveTooltip(): void {
  tooltipController.hide()
}

export function attachTooltip(
  target: HTMLElement,
  textOrGetter: string | (() => string | undefined),
): IDisposable {
  const store = new DisposableStore()

  store.add(
    addDisposableListener(target, 'mouseenter', () => {
      tooltipController.scheduleShow(target, textOrGetter)
    }),
  )
  store.add(
    addDisposableListener(target, 'mouseleave', () => {
      tooltipController.hideFor(target)
    }),
  )
  store.add(
    addDisposableListener(target, 'pointerdown', () => {
      tooltipController.hideFor(target)
    }),
  )
  store.add(
    addDisposableListener(target, 'click', () => {
      tooltipController.hideFor(target)
    }),
  )
  store.add(
    addDisposableListener(target, 'focus', () => {
      if (target.matches(':focus-visible')) {
        tooltipController.scheduleShow(target, textOrGetter)
      }
    }),
  )
  store.add(
    addDisposableListener(target, 'blur', () => {
      tooltipController.hideFor(target)
    }),
  )
  store.add(
    toDisposable(() => {
      tooltipController.hideFor(target)
    }),
  )

  return store
}
