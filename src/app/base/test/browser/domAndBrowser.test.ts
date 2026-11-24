import {
  getZoomFactor,
  getZoomLevel,
  isFullscreen,
  onDidChangeFullscreen,
  onDidChangeZoomLevel,
  setFullscreen,
  setZoomFactor,
  setZoomLevel,
} from '@app/base/browser/browser'
import { CODICON_NAMES, renderCodicon, setCodicon } from '@app/base/browser/codicons'
import {
  $,
  addDisposableListener,
  append,
  clearNode,
  isHTMLElement,
  toggleClass,
} from '@app/base/browser/dom'
import { createStyleSheet, setStyleSheetText } from '@app/base/browser/domStylesheets'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils'
import { type FakeDomHarness, installFakeDom } from './fakeDom'

describe('base browser helpers, browser state, stylesheets, and codicons', () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite()
  let dom: FakeDomHarness

  beforeEach(() => {
    dom = installFakeDom()
    setZoomLevel(0)
    setZoomFactor(1)
    setFullscreen(false)
  })

  afterEach(() => {
    dom.restore()
  })

  it('builds DOM trees with $, append, clearNode, toggleClass, and addDisposableListener', () => {
    const child = $<HTMLSpanElement>('span#badge.primary.pill', {
      class: 'extra',
      'aria-hidden': true,
      draggable: false,
      disabled: true,
      hidden: false,
      'data-role': 'chip',
      textContent: 'Initial',
    })
    expect(child.tagName).toBe('SPAN')
    expect(child.id).toBe('badge')
    expect(child.classList.contains('primary')).toBe(true)
    expect(child.classList.contains('pill')).toBe(true)
    expect(child.classList.contains('extra')).toBe(true)
    expect(child.getAttribute('aria-hidden')).toBe('true')
    expect(child.getAttribute('draggable')).toBe('false')
    expect(child.hasAttribute('disabled')).toBe(true)
    expect(child.hasAttribute('hidden')).toBe(false)
    expect(child.getAttribute('data-role')).toBe('chip')
    expect(isHTMLElement(child)).toBe(true)
    expect(isHTMLElement({})).toBe(false)

    const root = $<HTMLDivElement>('.wrapper', undefined, child, ' text', null, undefined)
    expect(root.tagName).toBe('DIV')

    const emptyParent = $<HTMLDivElement>('')
    append(emptyParent, 'extra')
    clearNode(emptyParent)
    expect(emptyParent.childNodes.length).toBe(0)

    toggleClass(root, 'active')
    expect(root.classList.contains('active')).toBe(true)
    toggleClass(root, 'active', false)
    expect(root.classList.contains('active')).toBe(false)

    let clicks = 0
    const listener = disposables.add(
      addDisposableListener(root, 'click', () => {
        clicks += 1
      }),
    )
    dom.dispatch(root as unknown as FakeDomHarness['container'], 'click')
    expect(clicks).toBe(1)
    listener.dispose()
    dom.dispatch(root as unknown as FakeDomHarness['container'], 'click')
    expect(clicks).toBe(1)
  })

  it('tracks zoom level, zoom factor, and fullscreen events in browser state', () => {
    const zoomEvents: number[] = []
    const fullscreenEvents: boolean[] = []
    disposables.add(onDidChangeZoomLevel((value) => zoomEvents.push(value)))
    disposables.add(onDidChangeFullscreen((value) => fullscreenEvents.push(value)))

    setZoomLevel(2)
    setZoomLevel(2)
    expect(getZoomLevel()).toBe(2)
    expect(zoomEvents).toEqual([2])

    setZoomFactor(1.44)
    expect(getZoomFactor()).toBe(1.44)

    setFullscreen(true)
    setFullscreen(true)
    expect(isFullscreen()).toBe(true)
    expect(fullscreenEvents).toEqual([true])
  })

  it('creates and updates dynamic style sheets', () => {
    const style = createStyleSheet(document.head, 'theme-vars')
    expect(style.className).toBe('theme-vars')
    setStyleSheetText(style, ':root { --test: 1; }')
    expect(style.textContent).toBe(':root { --test: 1; }')
    setStyleSheetText(style, ':root { --test: 1; }')
    expect(style.textContent).toBe(':root { --test: 1; }')
  })

  it('renders all 49 inline SVG Codicons and swaps icons via setCodicon', () => {
    expect(CODICON_NAMES).toHaveLength(49)
    expect(CODICON_NAMES).toContain('panel-bottom-off')

    for (const name of CODICON_NAMES) {
      const icon = renderCodicon(name, 14)
      expect(icon.classList.contains('codicon')).toBe(true)
      expect(icon.classList.contains(`codicon-${name}`)).toBe(true)
      const svg = icon.querySelector('svg')
      expect(svg).not.toBeNull()
      expect(svg?.getAttribute('width')).toBe('14')
      expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0)
    }

    const directIcon = renderCodicon('pin', 16)
    setCodicon(directIcon, 'pinned', 18)
    expect(directIcon.classList.contains('codicon-pinned')).toBe(true)
    expect(directIcon.classList.contains('codicon-pin')).toBe(false)
    expect(directIcon.querySelector('svg')?.getAttribute('width')).toBe('18')

    const button = document.createElement('button')
    setCodicon(button, 'settings-gear', 16)
    expect(button.querySelector('.codicon-settings-gear')).not.toBeNull()
  })
})
