export class FakeDataTransfer {
  private readonly store = new Map<string, string>()
  dropEffect = 'none'
  effectAllowed = 'all'

  get types(): readonly string[] {
    return [...this.store.keys()]
  }

  setData(format: string, data: string): void {
    this.store.set(format, data)
  }

  getData(format: string): string {
    return this.store.get(format) ?? ''
  }

  clearData(format?: string): void {
    if (format) {
      this.store.delete(format)
    } else {
      this.store.clear()
    }
  }
}

export interface FakeEventInit {
  readonly bubbles?: boolean | undefined
  readonly cancelable?: boolean | undefined
  readonly key?: string | undefined
  readonly code?: string | undefined
  readonly ctrlKey?: boolean | undefined
  readonly altKey?: boolean | undefined
  readonly metaKey?: boolean | undefined
  readonly shiftKey?: boolean | undefined
  readonly button?: number | undefined
  readonly clientX?: number | undefined
  readonly clientY?: number | undefined
  readonly pointerId?: number | undefined
  readonly matches?: boolean | undefined
  readonly dataTransfer?: FakeDataTransfer | undefined
  readonly error?: unknown
  readonly message?: string | undefined
  readonly reason?: unknown
}

export class FakeEvent {
  readonly type: string
  readonly bubbles: boolean
  readonly cancelable: boolean
  readonly key: string
  readonly code: string
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly metaKey: boolean
  readonly shiftKey: boolean
  readonly button: number
  readonly clientX: number
  readonly clientY: number
  readonly pointerId: number
  readonly matches: boolean
  readonly dataTransfer: FakeDataTransfer | undefined
  readonly error: unknown
  readonly message: string
  readonly reason: unknown
  defaultPrevented = false
  propagationStopped = false
  target: FakeEventTarget | null = null
  currentTarget: FakeEventTarget | null = null

  constructor(type: string, init: FakeEventInit = {}) {
    this.type = type
    this.bubbles = init.bubbles ?? false
    this.cancelable = init.cancelable ?? true
    this.key = init.key ?? ''
    this.code = init.code ?? ''
    this.ctrlKey = init.ctrlKey ?? false
    this.altKey = init.altKey ?? false
    this.metaKey = init.metaKey ?? false
    this.shiftKey = init.shiftKey ?? false
    this.button = init.button ?? 0
    this.clientX = init.clientX ?? 0
    this.clientY = init.clientY ?? 0
    this.pointerId = init.pointerId ?? 1
    this.matches = init.matches ?? false
    this.dataTransfer = init.dataTransfer
    this.error = init.error
    this.message = init.message ?? ''
    this.reason = init.reason
  }

  preventDefault(): void {
    if (this.cancelable) {
      this.defaultPrevented = true
    }
  }

  stopPropagation(): void {
    this.propagationStopped = true
  }
}

type FakeEventListener = (event: FakeEvent) => void

interface ListenerEntry {
  readonly listener: FakeEventListener
  readonly capture: boolean
}

function normalizeCapture(options?: boolean | AddEventListenerOptions): boolean {
  if (typeof options === 'boolean') {
    return options
  }
  return Boolean(options?.capture)
}

export class FakeEventTarget {
  private readonly listeners = new Map<string, ListenerEntry[]>()

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | FakeEventListener,
    options?: boolean | AddEventListenerOptions,
  ): void {
    const fn: FakeEventListener =
      typeof listener === 'function'
        ? (listener as FakeEventListener)
        : (event) => listener.handleEvent(event as unknown as Event)
    const capture = normalizeCapture(options)
    const list = this.listeners.get(type) ?? []
    const alreadyExists = list.some((entry) => entry.listener === fn && entry.capture === capture)
    if (!alreadyExists) {
      list.push({ listener: fn, capture })
      this.listeners.set(type, list)
    }
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | FakeEventListener,
    options?: boolean | EventListenerOptions,
  ): void {
    const list = this.listeners.get(type)
    if (!list) {
      return
    }
    const capture = normalizeCapture(options)
    const next = list.filter((entry) => entry.listener !== listener || entry.capture !== capture)
    if (next.length === 0) {
      this.listeners.delete(type)
    } else {
      this.listeners.set(type, next)
    }
  }

  dispatchEvent(event: FakeEvent): boolean {
    event.target = this
    const path = this.buildEventPath()

    for (let index = path.length - 1; index >= 1; index -= 1) {
      const target = path[index]
      if (!target) {
        continue
      }
      target.invokeListeners(event, true)
      if (event.propagationStopped) {
        return !event.defaultPrevented
      }
    }

    this.invokeListeners(event, 'target')
    if (event.propagationStopped || !event.bubbles) {
      return !event.defaultPrevented
    }

    for (let index = 1; index < path.length; index += 1) {
      const target = path[index]
      if (!target) {
        continue
      }
      target.invokeListeners(event, false)
      if (event.propagationStopped) {
        break
      }
    }

    return !event.defaultPrevented
  }

  protected getEventParent(): FakeEventTarget | null {
    return null
  }

  private buildEventPath(): FakeEventTarget[] {
    const path: FakeEventTarget[] = [this]
    let current = this.getEventParent()
    while (current) {
      path.push(current)
      current = current.getEventParent()
    }
    return path
  }

  private invokeListeners(event: FakeEvent, phase: boolean | 'target'): void {
    const list = this.listeners.get(event.type)
    if (!list || list.length === 0) {
      return
    }
    event.currentTarget = this
    for (const entry of [...list]) {
      if (phase === 'target' || entry.capture === phase) {
        entry.listener(event)
      }
    }
  }
}

export class FakeClassList {
  private readonly tokens = new Set<string>()
  private readonly onChange: () => void

  constructor(onChange: () => void) {
    this.onChange = onChange
  }

  get length(): number {
    return this.tokens.size
  }

  get value(): string {
    return [...this.tokens].join(' ')
  }

  setFromString(raw: string): void {
    this.tokens.clear()
    for (const token of raw.split(/\s+/)) {
      if (token.length > 0) {
        this.tokens.add(token)
      }
    }
    this.onChange()
  }

  add(...tokens: string[]): void {
    let changed = false
    for (const token of tokens) {
      if (token.length > 0 && !this.tokens.has(token)) {
        this.tokens.add(token)
        changed = true
      }
    }
    if (changed) {
      this.onChange()
    }
  }

  remove(...tokens: string[]): void {
    let changed = false
    for (const token of tokens) {
      if (this.tokens.delete(token)) {
        changed = true
      }
    }
    if (changed) {
      this.onChange()
    }
  }

  toggle(token: string, force?: boolean): boolean {
    if (force === true) {
      this.add(token)
      return true
    }
    if (force === false) {
      this.remove(token)
      return false
    }
    if (this.tokens.has(token)) {
      this.remove(token)
      return false
    }
    this.add(token)
    return true
  }

  contains(token: string): boolean {
    return this.tokens.has(token)
  }

  [Symbol.iterator](): IterableIterator<string> {
    return this.tokens.values()
  }
}

export interface FakeStyleDeclaration extends Record<string, unknown> {
  setProperty(name: string, value: string): void
  getPropertyValue(name: string): string
  removeProperty(name: string): string
}

function createFakeStyle(): FakeStyleDeclaration {
  const values = new Map<string, string>()
  const base = {
    setProperty(name: string, value: string): void {
      values.set(name, value)
    },
    getPropertyValue(name: string): string {
      return values.get(name) ?? ''
    },
    removeProperty(name: string): string {
      const previous = values.get(name) ?? ''
      values.delete(name)
      return previous
    },
  }
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && !(prop in target)) {
        return values.get(prop) ?? ''
      }
      return Reflect.get(target, prop, receiver)
    },
    set(target, prop, value) {
      if (typeof prop === 'string' && !(prop in target)) {
        values.set(prop, String(value ?? ''))
        return true
      }
      return Reflect.set(target, prop, value)
    },
  }) as unknown as FakeStyleDeclaration
}

export class FakeNode extends FakeEventTarget {
  parentNode: FakeNode | null = null
  readonly childNodes: FakeNode[] = []
  readonly ownerDocument: FakeDocument | null

  constructor(ownerDocument: FakeDocument | null) {
    super()
    this.ownerDocument = ownerDocument
  }

  get firstChild(): FakeNode | null {
    return this.childNodes[0] ?? null
  }

  get isConnected(): boolean {
    let current: FakeNode | null = this
    while (current) {
      if (current instanceof FakeDocument) {
        return true
      }
      current = current.parentNode
    }
    return false
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join('')
  }

  set textContent(value: string) {
    while (this.childNodes.length > 0) {
      const child = this.childNodes[0]
      if (child) {
        this.removeChild(child)
      }
    }
    if (value.length > 0 && this.ownerDocument) {
      this.appendChild(this.ownerDocument.createTextNode(value))
    }
  }

  appendChild<T extends FakeNode>(child: T): T {
    if (child.parentNode) {
      child.parentNode.removeChild(child)
    }
    child.parentNode = this
    this.childNodes.push(child)
    return child
  }

  insertBefore<T extends FakeNode>(newChild: T, referenceChild: FakeNode | null): T {
    if (!referenceChild) {
      return this.appendChild(newChild)
    }
    const refIndex = this.childNodes.indexOf(referenceChild)
    if (refIndex < 0) {
      return this.appendChild(newChild)
    }
    if (newChild.parentNode) {
      newChild.parentNode.removeChild(newChild)
    }
    const adjustedIndex = this.childNodes.indexOf(referenceChild)
    newChild.parentNode = this
    this.childNodes.splice(adjustedIndex, 0, newChild)
    return newChild
  }

  removeChild<T extends FakeNode>(child: T): T {
    const index = this.childNodes.indexOf(child)
    if (index >= 0) {
      this.childNodes.splice(index, 1)
      child.parentNode = null
    }
    return child
  }

  remove(): void {
    this.parentNode?.removeChild(this)
  }

  contains(other: unknown): boolean {
    if (!(other instanceof FakeNode)) {
      return false
    }
    let current: FakeNode | null = other
    while (current) {
      if (current === this) {
        return true
      }
      current = current.parentNode
    }
    return false
  }

  protected override getEventParent(): FakeEventTarget | null {
    return this.parentNode
  }
}

export class FakeTextNode extends FakeNode {
  private data: string

  constructor(ownerDocument: FakeDocument, text: string) {
    super(ownerDocument)
    this.data = text
  }

  override get textContent(): string {
    return this.data
  }

  override set textContent(value: string) {
    this.data = value
  }
}

export interface FakeRect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly width: number
  readonly height: number
  readonly x: number
  readonly y: number
}

function matchesSimpleSelector(element: FakeElement, selector: string): boolean {
  const trimmed = selector.trim()
  if (trimmed.length === 0) {
    return false
  }

  if (trimmed === ':focus-visible') {
    return element.focusVisible
  }

  let remaining = trimmed
  let negated = false
  const notMatch = remaining.match(/:not\(([^)]+)\)/)
  let notClause: string | null = null
  if (notMatch?.[1]) {
    notClause = notMatch[1]
    remaining = remaining.replace(notMatch[0], '')
    negated = true
  }

  const tagMatch = remaining.match(/^[A-Za-z][A-Za-z0-9-]*/)
  if (tagMatch) {
    const expectedTag = tagMatch[0].toLowerCase()
    if (element.tagName.toLowerCase() !== expectedTag) {
      return false
    }
    remaining = remaining.slice(tagMatch[0].length)
  }

  for (const attrMatch of remaining.matchAll(/\[([A-Za-z0-9_-]+)(?:="([^"]*)")?\]/g)) {
    const attrName = attrMatch[1]
    const expectedValue = attrMatch[2]
    if (!attrName) {
      continue
    }
    if (!element.hasAttribute(attrName)) {
      return false
    }
    if (expectedValue !== undefined && element.getAttribute(attrName) !== expectedValue) {
      return false
    }
  }

  remaining = remaining.replace(/\[[^\]]*\]/g, '')

  const idMatch = remaining.match(/#([A-Za-z0-9_-]+)/)
  if (idMatch?.[1] && element.id !== idMatch[1]) {
    return false
  }

  for (const classMatch of remaining.matchAll(/\.([A-Za-z0-9_-]+)/g)) {
    const className = classMatch[1]
    if (className && !element.classList.contains(className)) {
      return false
    }
  }

  if (remaining.includes(':disabled') && !element.disabled) {
    return false
  }

  if (negated && notClause) {
    if (notClause === ':disabled' && element.disabled) {
      return false
    }
    const notAttrMatch = notClause.match(/^\[([A-Za-z0-9_-]+)="([^"]*)"\]$/)
    if (notAttrMatch?.[1]) {
      if (element.getAttribute(notAttrMatch[1]) === notAttrMatch[2]) {
        return false
      }
    }
  }

  return true
}

function splitSelectorParts(selector: string): string[] {
  const parts: string[] = []
  let current = ''
  let bracketDepth = 0
  let inQuotes = false

  for (const char of selector.trim()) {
    if (char === '"') {
      inQuotes = !inQuotes
      current += char
      continue
    }
    if (!inQuotes) {
      if (char === '[') {
        bracketDepth += 1
      } else if (char === ']' && bracketDepth > 0) {
        bracketDepth -= 1
      } else if (bracketDepth === 0 && /\s/.test(char)) {
        if (current.length > 0) {
          parts.push(current)
          current = ''
        }
        continue
      }
    }
    current += char
  }
  if (current.length > 0) {
    parts.push(current)
  }
  return parts
}

function matchesSelectorChain(element: FakeElement, selector: string): boolean {
  const parts = splitSelectorParts(selector)
  if (parts.length === 0) {
    return false
  }
  const lastPart = parts[parts.length - 1]
  if (!lastPart || !matchesSimpleSelector(element, lastPart)) {
    return false
  }
  if (parts.length === 1) {
    return true
  }
  let ancestor: FakeNode | null = element.parentNode
  let partIndex = parts.length - 2
  while (ancestor && partIndex >= 0) {
    const part = parts[partIndex]
    if (ancestor instanceof FakeElement && part && matchesSimpleSelector(ancestor, part)) {
      partIndex -= 1
    }
    ancestor = ancestor.parentNode
  }
  return partIndex < 0
}

function matchesSelectorList(element: FakeElement, selectorList: string): boolean {
  return selectorList
    .split(',')
    .map((part) => part.trim())
    .some((part) => matchesSelectorChain(element, part))
}

export class FakeElement extends FakeNode {
  readonly tagName: string
  readonly namespaceURI: string | null
  readonly attributes = new Map<string, string>()
  readonly classList: FakeClassList
  readonly style: FakeStyleDeclaration = createFakeStyle()
  private readonly activePointers = new Set<number>()
  private _disabled = false
  private _checked = false
  private _value = ''
  private _placeholder = ''
  private _tabIndex = -1
  private customRect: FakeRect | null = null
  focusVisible = false
  selected = false
  isContentEditable = false
  scrollIntoViewCount = 0

  constructor(ownerDocument: FakeDocument, tagName: string, namespaceURI: string | null = null) {
    super(ownerDocument)
    this.tagName = namespaceURI ? tagName : tagName.toUpperCase()
    this.namespaceURI = namespaceURI
    this.classList = new FakeClassList(() => {
      const value = this.classList.value
      if (value.length > 0) {
        this.attributes.set('class', value)
      } else {
        this.attributes.delete('class')
      }
    })
  }

  get id(): string {
    return this.attributes.get('id') ?? ''
  }

  set id(value: string) {
    this.attributes.set('id', value)
  }

  get lang(): string {
    return this.attributes.get('lang') ?? ''
  }

  set lang(value: string) {
    this.attributes.set('lang', value)
  }

  get className(): string {
    return this.classList.value
  }

  set className(value: string) {
    this.classList.setFromString(value)
  }

  get disabled(): boolean {
    return this._disabled
  }

  set disabled(value: boolean) {
    this._disabled = Boolean(value)
    if (this._disabled) {
      this.attributes.set('disabled', '')
    } else {
      this.attributes.delete('disabled')
    }
  }

  get checked(): boolean {
    return this._checked
  }

  set checked(value: boolean) {
    this._checked = Boolean(value)
  }

  get value(): string {
    return this._value
  }

  set value(nextValue: string) {
    this._value = String(nextValue)
  }

  get placeholder(): string {
    return this._placeholder
  }

  set placeholder(nextValue: string) {
    this._placeholder = nextValue
    this.attributes.set('placeholder', nextValue)
  }

  get tabIndex(): number {
    return this._tabIndex
  }

  set tabIndex(nextValue: number) {
    this._tabIndex = nextValue
    this.attributes.set('tabindex', String(nextValue))
  }

  get children(): FakeElement[] {
    return this.childNodes.filter((node): node is FakeElement => node instanceof FakeElement)
  }

  get childElementCount(): number {
    return this.children.length
  }

  get outerHTML(): string {
    const tag = this.tagName.toLowerCase()
    const attrs = [...this.attributes.entries()].map(([key, val]) => ` ${key}="${val}"`).join('')
    const inner = this.childNodes
      .map((child) => (child instanceof FakeElement ? child.outerHTML : child.textContent))
      .join('')
    return `<${tag}${attrs}>${inner}</${tag}>`
  }

  setAttribute(name: string, value: string): void {
    const str = String(value)
    if (name === 'class') {
      this.classList.setFromString(str)
      return
    }
    this.attributes.set(name, str)
    if (name === 'disabled') {
      this._disabled = true
    } else if (name === 'value') {
      this._value = str
    } else if (name === 'placeholder') {
      this._placeholder = str
    } else if (name === 'tabindex') {
      const parsed = Number.parseInt(str, 10)
      if (!Number.isNaN(parsed)) {
        this._tabIndex = parsed
      }
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name)
  }

  getAttributeNames(): string[] {
    return [...this.attributes.keys()]
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name)
    if (name === 'class') {
      this.classList.setFromString('')
    } else if (name === 'disabled') {
      this._disabled = false
    } else if (name === 'tabindex') {
      this._tabIndex = -1
    }
  }

  click(): void {
    if (this._disabled) {
      return
    }
    this.dispatchEvent(new FakeEvent('click', { bubbles: true, cancelable: true }))
  }

  focus(): void {
    if (!this.ownerDocument) {
      return
    }
    const previous = this.ownerDocument.activeElement
    if (previous && previous !== this) {
      previous.dispatchEvent(new FakeEvent('blur', { bubbles: false }))
    }
    this.ownerDocument.activeElement = this
    this.dispatchEvent(new FakeEvent('focus', { bubbles: false }))
  }

  blur(): void {
    if (!this.ownerDocument) {
      return
    }
    if (this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = this.ownerDocument.body
      this.dispatchEvent(new FakeEvent('blur', { bubbles: false }))
    }
  }

  select(): void {
    this.selected = true
  }

  matches(selector: string): boolean {
    return matchesSelectorList(this, selector)
  }

  closest(selector: string): FakeElement | null {
    let current: FakeNode | null = this
    while (current) {
      if (current instanceof FakeElement && current.matches(selector)) {
        return current
      }
      current = current.parentNode
    }
    return null
  }

  scrollIntoView(): void {
    this.scrollIntoViewCount += 1
  }

  setBoundingClientRect(rect: Partial<FakeRect>): void {
    const left = rect.left ?? 0
    const top = rect.top ?? 0
    const width = rect.width ?? 120
    const height = rect.height ?? 28
    this.customRect = {
      left,
      top,
      width,
      height,
      right: rect.right ?? left + width,
      bottom: rect.bottom ?? top + height,
      x: rect.x ?? left,
      y: rect.y ?? top,
    }
  }

  getBoundingClientRect(): FakeRect {
    if (this.customRect) {
      return this.customRect
    }
    return {
      left: 20,
      top: 40,
      width: 140,
      height: 32,
      right: 160,
      bottom: 72,
      x: 20,
      y: 40,
    }
  }

  setPointerCapture(pointerId: number): void {
    this.activePointers.add(pointerId)
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.activePointers.has(pointerId)
  }

  releasePointerCapture(pointerId: number): void {
    this.activePointers.delete(pointerId)
  }

  querySelectorAll(selector: string): FakeElement[] {
    const results: FakeElement[] = []
    const visit = (node: FakeNode): void => {
      for (const child of node.childNodes) {
        if (child instanceof FakeElement) {
          if (matchesSelectorList(child, selector)) {
            results.push(child)
          }
          visit(child)
        }
      }
    }
    visit(this)
    return results
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null
  }
}

export class FakeHTMLElement extends FakeElement {
  constructor(ownerDocument: FakeDocument, tagName: string) {
    super(ownerDocument, tagName, null)
  }
}

export class FakeSVGElement extends FakeElement {
  constructor(ownerDocument: FakeDocument, tagName: string, namespaceURI: string) {
    super(ownerDocument, tagName, namespaceURI)
  }
}

export class FakeDocument extends FakeNode {
  readonly documentElement: FakeHTMLElement
  readonly head: FakeHTMLElement
  readonly body: FakeHTMLElement
  activeElement: FakeElement | null
  title = ''
  private readonly ownerWindow: FakeWindow

  constructor(ownerWindow: FakeWindow) {
    super(null)
    this.ownerWindow = ownerWindow
    this.documentElement = new FakeHTMLElement(this, 'html')
    this.head = new FakeHTMLElement(this, 'head')
    this.body = new FakeHTMLElement(this, 'body')
    this.documentElement.appendChild(this.head)
    this.documentElement.appendChild(this.body)
    this.appendChild(this.documentElement)
    this.activeElement = this.body
  }

  override get isConnected(): boolean {
    return true
  }

  createElement(tagName: string): FakeHTMLElement {
    return new FakeHTMLElement(this, tagName)
  }

  createElementNS(namespaceURI: string, tagName: string): FakeSVGElement {
    return new FakeSVGElement(this, tagName, namespaceURI)
  }

  createTextNode(text: string): FakeTextNode {
    return new FakeTextNode(this, text)
  }

  getElementById(id: string): FakeElement | null {
    return this.querySelector(`#${id}`)
  }

  querySelector(selector: string): FakeElement | null {
    return this.documentElement.querySelector(selector)
  }

  querySelectorAll(selector: string): FakeElement[] {
    return this.documentElement.querySelectorAll(selector)
  }

  protected override getEventParent(): FakeEventTarget | null {
    return this.ownerWindow
  }
}

export class FakeMediaQueryList extends FakeEventTarget {
  matches: boolean

  constructor(matches: boolean) {
    super()
    this.matches = matches
  }

  setMatches(matches: boolean): void {
    this.matches = matches
    this.dispatchEvent(new FakeEvent('change', { matches }))
  }
}

export class FakeWindow extends FakeEventTarget {
  innerWidth = 1280
  innerHeight = 800
  readonly document: FakeDocument
  readonly mediaQueryList: FakeMediaQueryList
  baseapp?: unknown

  constructor() {
    super()
    this.document = new FakeDocument(this)
    this.mediaQueryList = new FakeMediaQueryList(true)
  }

  get darkSchemeMatches(): boolean {
    return this.mediaQueryList.matches
  }

  set darkSchemeMatches(value: boolean) {
    this.mediaQueryList.setMatches(value)
  }

  matchMedia(_query: string): FakeMediaQueryList {
    return this.mediaQueryList
  }
}

export interface FakeDomHarness {
  readonly window: FakeWindow
  readonly document: FakeDocument
  readonly container: FakeHTMLElement
  dispatch(target: FakeEventTarget, type: string, init?: FakeEventInit): FakeEvent
  restore(): void
}

export function installFakeDom(): FakeDomHarness {
  const globals = globalThis as Record<string, unknown>
  const previousKeys = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement']
  const saved = new Map<string, PropertyDescriptor | undefined>()
  for (const key of previousKeys) {
    saved.set(key, Object.getOwnPropertyDescriptor(globals, key))
  }

  const fakeWindow = new FakeWindow()
  const fakeDocument = fakeWindow.document
  const container = fakeDocument.createElement('div')
  fakeDocument.body.appendChild(container)

  globals.window = fakeWindow
  globals.document = fakeDocument
  globals.Node = FakeNode
  globals.Element = FakeElement
  globals.HTMLElement = FakeHTMLElement
  globals.SVGElement = FakeSVGElement

  return {
    window: fakeWindow,
    document: fakeDocument,
    container,
    dispatch(target: FakeEventTarget, type: string, init?: FakeEventInit): FakeEvent {
      const event = new FakeEvent(type, init)
      target.dispatchEvent(event)
      return event
    },
    restore(): void {
      while (fakeDocument.body.firstChild) {
        fakeDocument.body.removeChild(fakeDocument.body.firstChild)
      }
      while (fakeDocument.head.firstChild) {
        fakeDocument.head.removeChild(fakeDocument.head.firstChild)
      }
      for (const [key, descriptor] of saved) {
        if (descriptor) {
          Object.defineProperty(globals, key, descriptor)
        } else {
          delete globals[key]
        }
      }
    },
  }
}
