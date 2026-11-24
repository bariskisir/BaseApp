import { Event } from '@app/base/common/event'
import { DisposableStore } from '@app/base/common/lifecycle'
import {
  FakeDataTransfer,
  type FakeDomHarness,
  type FakeElement,
  installFakeDom,
} from '@app/base/test/browser/fakeDom'
import { ensureNoDisposablesAreLeakedInTestSuite, must } from '@app/base/test/common/utils'
import { AuxiliaryBarPart } from '@app/workbench/browser/parts/auxiliarybar/auxiliaryBarPart'
import { SidebarPart } from '@app/workbench/browser/parts/sidebar/sidebarPart'
import { TertiaryBarPart } from '@app/workbench/browser/parts/tertiarybar/tertiaryBarPart'
import { VIEW_DRAG_MIME_TYPE } from '@app/workbench/browser/viewPane'
import { registerView } from '@app/workbench/common/views'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createWorkbenchTestContext } from './workbenchTestServices'

describe('Primary, Secondary, and Tertiary sidebar parts', () => {
  let dom: FakeDomHarness

  beforeEach(() => {
    dom = installFakeDom()
  })

  afterEach(() => {
    dom.restore()
  })

  const disposables = ensureNoDisposablesAreLeakedInTestSuite()

  it('starts at minimum default sizes, opens 3-way move menu, supports drag-and-drop and Sash resizing', async () => {
    const ctx = await createWorkbenchTestContext(disposables)

    const regOne = disposables.add(
      registerView({
        id: 'test.sidebar.one',
        titleKey: 'nav.sessions',
        iconId: 'files',
        defaultLocation: 'sidebar',
        order: 1,
        canMoveView: true,
        factory: () => () => {
          const store = new DisposableStore()
          const element = dom.document.createElement('div') as unknown as HTMLElement
          element.textContent = 'View One'
          return {
            id: 'test.sidebar.one',
            element,
            onDidChangeHeaderActions: Event.None,
            getHeaderActions: () => [],
            dispose: () => store.dispose(),
          }
        },
      }),
    )
    const regTwo = disposables.add(
      registerView({
        id: 'test.sidebar.two',
        titleKey: 'nav.settings',
        iconId: 'settings-gear',
        defaultLocation: 'sidebar',
        order: 2,
        canMoveView: true,
        factory: () => () => {
          const store = new DisposableStore()
          const element = dom.document.createElement('div') as unknown as HTMLElement
          element.textContent = 'View Two'
          return {
            id: 'test.sidebar.two',
            element,
            onDidChangeHeaderActions: Event.None,
            getHeaderActions: () => [],
            dispose: () => store.dispose(),
          }
        },
      }),
    )

    const primary = disposables.add(ctx.instantiationService.createInstance(SidebarPart))
    const secondary = disposables.add(ctx.instantiationService.createInstance(AuxiliaryBarPart))
    const tertiary = disposables.add(ctx.instantiationService.createInstance(TertiaryBarPart))

    primary.create(dom.container as unknown as HTMLElement)
    secondary.create(dom.container as unknown as HTMLElement)
    tertiary.create(dom.container as unknown as HTMLElement)

    const primaryEl = must(primary.element)
    const secondaryEl = must(secondary.element)
    const tertiaryEl = must(tertiary.element)

    expect(primaryEl.style.width).toBe('170px')
    expect(secondaryEl.style.width).toBe('170px')
    expect(tertiaryEl.style.height).toBe('120px')
    expect(tertiaryEl.classList.contains('sidebar-edge-bottom')).toBe(true)

    const viewTabs = primaryEl.querySelectorAll('.sidebar-view-tab') as unknown as FakeElement[]
    expect(viewTabs).toHaveLength(2)
    dom.dispatch(must(viewTabs[1]), 'click')
    expect(ctx.viewDescriptorService.getActiveViewId('sidebar')).toBe('test.sidebar.two')

    const moveButton = primaryEl.querySelector(
      'button[aria-label="Move View"]',
    ) as unknown as FakeElement
    expect(moveButton).not.toBeNull()
    dom.dispatch(moveButton, 'click')

    const menuItems = dom.document.body.querySelectorAll('.monaco-menu-item')
    expect(menuItems).toHaveLength(2)
    expect(menuItems[0]?.textContent).toContain('Secondary Side Bar')
    expect(menuItems[1]?.textContent).toContain('Tertiary Side Bar')

    dom.dispatch(must(menuItems[1]), 'click')
    expect(ctx.viewDescriptorService.getViewLocation('test.sidebar.two')).toBe('tertiarybar')
    expect(ctx.layoutService.tertiaryBarOpen).toBe(true)

    const tertiarySash = tertiaryEl.querySelector(
      '.monaco-sash.horizontal',
    ) as unknown as FakeElement
    expect(tertiarySash).not.toBeNull()
    dom.dispatch(tertiarySash, 'pointerdown', { button: 0, clientY: 600, pointerId: 1 })
    dom.dispatch(dom.window, 'pointermove', { clientY: 520 })
    dom.dispatch(dom.window, 'pointerup')
    expect(ctx.layoutService.tertiaryBarHeight).toBe(200)
    dom.dispatch(tertiarySash, 'keydown', { key: 'ArrowUp' })
    expect(ctx.layoutService.tertiaryBarHeight).toBe(216)

    const dt = new FakeDataTransfer()
    dt.setData(VIEW_DRAG_MIME_TYPE, 'test.sidebar.one')
    dom.dispatch(secondaryEl as unknown as FakeElement, 'dragenter', { dataTransfer: dt })
    dom.dispatch(secondaryEl as unknown as FakeElement, 'dragover', { dataTransfer: dt })
    dom.dispatch(secondaryEl as unknown as FakeElement, 'drop', { dataTransfer: dt })
    expect(ctx.viewDescriptorService.getViewLocation('test.sidebar.one')).toBe('auxiliarybar')
    expect(ctx.layoutService.auxiliaryBarOpen).toBe(true)

    const primaryHeader = primaryEl.querySelector('.sidebar-header') as unknown as FakeElement
    dom.dispatch(primaryHeader, 'contextmenu', { clientX: 50, clientY: 50 })
    expect(dom.document.body.querySelector('.monaco-menu')).not.toBeNull()

    const primaryEmptyButtons = primaryEl.querySelectorAll(
      '.sidebar-empty-actions .monaco-text-button',
    ) as unknown as FakeElement[]
    expect(primaryEmptyButtons.length).toBeGreaterThanOrEqual(2)
    dom.dispatch(must(primaryEmptyButtons[0]), 'click')

    const closeTertiaryBtn = tertiaryEl.querySelector(
      'button[aria-label="Hide Tertiary Side Bar"]',
    ) as unknown as FakeElement
    if (closeTertiaryBtn) {
      dom.dispatch(closeTertiaryBtn, 'click')
      expect(ctx.layoutService.tertiaryBarOpen).toBe(false)
    }

    const primarySash = primaryEl.querySelector('.monaco-sash.vertical') as unknown as FakeElement
    dom.dispatch(primarySash, 'pointerdown', { button: 0, clientX: 170, pointerId: 2 })
    dom.dispatch(dom.window, 'pointermove', { clientX: 250 })
    dom.dispatch(dom.window, 'pointerup')
    expect(ctx.layoutService.sidebarWidth).toBe(250)

    regOne.dispose()
    regTwo.dispose()
  })
})
