import './progressBar.scss'
import { toDisposable } from '@app/base/common/lifecycle'
import { clamp } from '@app/base/common/number'
import { $, toggleClass } from '../../dom'
import { Widget } from '../widget'

export class ProgressBar extends Widget {
  private readonly bitElement: HTMLDivElement

  constructor(container: HTMLElement) {
    const bitElement = $<HTMLDivElement>('div.monaco-progress-bit')
    const wrapper = $<HTMLDivElement>(
      'div.monaco-progress-container',
      {
        role: 'progressbar',
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-hidden': true,
      },
      bitElement,
    )
    super(wrapper)

    this.bitElement = bitElement

    container.appendChild(this.element)
    this._register(toDisposable(() => this.element.remove()))
  }

  setProgress(percent: number | null): void {
    if (percent === null) {
      toggleClass(this.element, 'active', false)
      toggleClass(this.element, 'discrete', false)
      toggleClass(this.element, 'infinite', false)
      this.bitElement.style.width = '0%'
      this.element.setAttribute('aria-hidden', 'true')
      this.element.removeAttribute('aria-valuenow')
      return
    }

    const clamped = clamp(percent, 0, 100)
    toggleClass(this.element, 'active', true)
    toggleClass(this.element, 'discrete', true)
    toggleClass(this.element, 'infinite', false)
    this.bitElement.style.width = `${clamped}%`
    this.element.setAttribute('aria-hidden', 'false')
    this.element.setAttribute('aria-valuenow', String(Math.round(clamped)))
  }

  setIndeterminate(active: boolean): void {
    if (active) {
      toggleClass(this.element, 'active', true)
      toggleClass(this.element, 'discrete', false)
      toggleClass(this.element, 'infinite', true)
      this.bitElement.style.width = ''
      this.element.setAttribute('aria-hidden', 'false')
      this.element.removeAttribute('aria-valuenow')
      return
    }

    if (this.element.classList.contains('infinite')) {
      toggleClass(this.element, 'active', false)
      toggleClass(this.element, 'infinite', false)
      this.element.setAttribute('aria-hidden', 'true')
    }
  }
}
