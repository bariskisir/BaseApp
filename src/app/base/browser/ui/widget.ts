import { Disposable, type IDisposable } from '@app/base/common/lifecycle'
import { addDisposableListener } from '../dom'

export abstract class Widget extends Disposable {
  readonly element: HTMLElement

  protected constructor(element: HTMLElement) {
    super()
    this.element = element
  }

  protected listen<K extends keyof HTMLElementEventMap>(
    node: HTMLElement,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): IDisposable
  protected listen<K extends keyof DocumentEventMap>(
    node: Document,
    type: K,
    handler: (event: DocumentEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): IDisposable
  protected listen<K extends keyof WindowEventMap>(
    node: Window,
    type: K,
    handler: (event: WindowEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): IDisposable
  protected listen<K extends keyof HTMLElementEventMap>(
    node: EventTarget,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): IDisposable
  protected listen<E extends Event = Event>(
    node: EventTarget,
    type: string,
    handler: (event: E) => void,
    options?: boolean | AddEventListenerOptions,
  ): IDisposable
  protected listen(
    node: EventTarget,
    type: string,
    handler: (event: never) => void,
    options?: boolean | AddEventListenerOptions,
  ): IDisposable {
    return this._register(
      addDisposableListener(node, type, handler as (event: Event) => void, options),
    )
  }
}
