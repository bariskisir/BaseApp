import { $ } from '@app/base/browser/dom'
import { toDisposable } from '@app/base/common/lifecycle'
import { Component } from './component'

export abstract class Part extends Component {
  protected _element: HTMLElement | undefined

  get element(): HTMLElement | undefined {
    return this._element
  }

  create(parent: HTMLElement): HTMLElement {
    const element = $<HTMLDivElement>('div.part', {
      id: this.id,
      class: this.partClassName,
    })
    this._element = element
    this.createContentArea(element)
    parent.appendChild(element)
    this._register(
      toDisposable(() => {
        element.remove()
        if (this._element === element) {
          this._element = undefined
        }
      }),
    )
    return element
  }

  protected abstract readonly partClassName: string

  protected abstract createContentArea(parent: HTMLElement): void
}
