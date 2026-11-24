import { type IDisposable, toDisposable } from '@app/base/common/lifecycle'

export type DomChild = Node | string | null | undefined

export type DomAttributes = Record<string, string | boolean | undefined>

interface ParsedTagSelector {
  readonly tagName: string
  readonly id: string | undefined
  readonly classes: readonly string[]
}

function parseTagSelector(selector: string): ParsedTagSelector {
  const firstDelimiter = selector.search(/[.#]/)
  if (firstDelimiter === -1) {
    return {
      tagName: selector.length > 0 ? selector : 'div',
      id: undefined,
      classes: [],
    }
  }

  const tagName = firstDelimiter === 0 ? 'div' : selector.slice(0, firstDelimiter)
  const remainder = selector.slice(firstDelimiter)
  const classes: string[] = []
  let id: string | undefined

  let index = 0
  while (index < remainder.length) {
    const marker = remainder.charAt(index)
    let end = index + 1
    while (
      end < remainder.length &&
      remainder.charAt(end) !== '.' &&
      remainder.charAt(end) !== '#'
    ) {
      end += 1
    }
    const token = remainder.slice(index + 1, end)
    if (token.length > 0) {
      if (marker === '#') {
        id = token
      } else if (marker === '.') {
        classes.push(token)
      }
    }
    index = end
  }

  return { tagName, id, classes }
}

export function $<T extends HTMLElement = HTMLElement>(
  tagName: string,
  attrs?: DomAttributes,
  ...children: DomChild[]
): T {
  const parsed = parseTagSelector(tagName)
  const element = document.createElement(parsed.tagName)

  if (parsed.id !== undefined) {
    element.id = parsed.id
  }
  if (parsed.classes.length > 0) {
    element.classList.add(...parsed.classes)
  }

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined) {
        continue
      }
      if (key === 'class' || key === 'className') {
        if (typeof value === 'string') {
          for (const token of value.split(/\s+/)) {
            if (token.length > 0) {
              element.classList.add(token)
            }
          }
        }
        continue
      }
      if (key === 'textContent') {
        if (typeof value === 'string') {
          element.textContent = value
        }
        continue
      }
      if (typeof value === 'boolean') {
        if (key.startsWith('aria-') || key === 'draggable') {
          element.setAttribute(key, value ? 'true' : 'false')
        } else if (value) {
          element.setAttribute(key, '')
        }
        continue
      }
      element.setAttribute(key, value)
    }
  }

  append(element, ...children)
  return element as T
}

export function append(parent: HTMLElement, ...children: DomChild[]): void {
  for (const child of children) {
    if (child === null || child === undefined) {
      continue
    }
    if (typeof child === 'string') {
      parent.appendChild(document.createTextNode(child))
    } else {
      parent.appendChild(child)
    }
  }
}

export function clearNode(element: HTMLElement): void {
  while (element.firstChild) {
    element.removeChild(element.firstChild)
  }
}

export function addDisposableListener<K extends keyof HTMLElementEventMap>(
  node: HTMLElement,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
): IDisposable
export function addDisposableListener<K extends keyof DocumentEventMap>(
  node: Document,
  type: K,
  handler: (event: DocumentEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
): IDisposable
export function addDisposableListener<K extends keyof WindowEventMap>(
  node: Window,
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
): IDisposable
export function addDisposableListener<K extends keyof HTMLElementEventMap>(
  node: EventTarget,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
): IDisposable
export function addDisposableListener<E extends Event = Event>(
  node: EventTarget,
  type: string,
  handler: (event: E) => void,
  options?: boolean | AddEventListenerOptions,
): IDisposable
export function addDisposableListener(
  node: EventTarget,
  type: string,
  handler: (event: never) => void,
  options?: boolean | AddEventListenerOptions,
): IDisposable {
  const listener = handler as EventListener
  node.addEventListener(type, listener, options)
  return toDisposable(() => {
    node.removeEventListener(type, listener, options)
  })
}

export function toggleClass(element: HTMLElement, className: string, force?: boolean): void {
  if (force === undefined) {
    element.classList.toggle(className)
  } else {
    element.classList.toggle(className, force)
  }
}

export function isHTMLElement(value: unknown): value is HTMLElement {
  return typeof HTMLElement !== 'undefined' && value instanceof HTMLElement
}
