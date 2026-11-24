import {
  type FakeDomHarness,
  type FakeElement,
  installFakeDom,
} from '@app/base/test/browser/fakeDom'
import { ensureNoDisposablesAreLeakedInTestSuite, must } from '@app/base/test/common/utils'
import { StatusbarPart } from '@app/workbench/browser/parts/statusbar/statusbarPart'
import { TitlebarPart } from '@app/workbench/browser/parts/titlebar/titlebarPart'
import '@app/workbench/contrib/window/browser/window.contribution'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createWorkbenchTestContext } from './workbenchTestServices'

describe('TitlebarPart and StatusbarPart', () => {
  let dom: FakeDomHarness

  beforeEach(() => {
    dom = installFakeDom()
  })

  afterEach(() => {
    dom.restore()
  })

  const disposables = ensureNoDisposablesAreLeakedInTestSuite()

  it('renders always-top Titlebar navigation, 3 sidebar layout toggles, customize menu, and window controls', async () => {
    const ctx = await createWorkbenchTestContext(disposables)
    const titlebar = disposables.add(ctx.instantiationService.createInstance(TitlebarPart))
    titlebar.create(dom.container as unknown as HTMLElement)
    const titlebarEl = must(titlebar.element, 'titlebar element')

    const navActions = titlebarEl.querySelector('.titlebar-nav-actions')
    expect(navActions?.classList.contains('hidden')).toBe(false)

    const layoutButtons = titlebarEl.querySelectorAll(
      '.titlebar-layout-controls .titlebar-button',
    ) as unknown as FakeElement[]
    expect(layoutButtons).toHaveLength(4)

    const layoutBtn1 = must(layoutButtons[1])
    const layoutBtn2 = must(layoutButtons[2])
    const layoutBtn3 = must(layoutButtons[3])

    dom.dispatch(layoutBtn1, 'click')
    expect(ctx.layoutService.tertiaryBarOpen).toBe(true)

    dom.dispatch(layoutBtn2, 'click')
    expect(ctx.layoutService.auxiliaryBarOpen).toBe(true)

    const openAndClickCustomizeItem = (index: number): FakeElement[] => {
      dom.dispatch(layoutBtn3, 'click')
      const items = dom.document.body.querySelectorAll('.monaco-menu-item')
      dom.dispatch(must(items[index]), 'click')
      return items
    }

    const menuItems = openAndClickCustomizeItem(2)
    expect(menuItems.some((item) => item.textContent.includes('Tertiary Side Bar'))).toBe(true)
    expect(ctx.layoutService.tertiaryBarOpen).toBe(false)

    openAndClickCustomizeItem(0)
    openAndClickCustomizeItem(1)
    openAndClickCustomizeItem(3)
    openAndClickCustomizeItem(4)
    openAndClickCustomizeItem(5)
    openAndClickCustomizeItem(6)

    const brandBtn = titlebarEl.querySelector(
      'button[aria-label="BaseApp"]',
    ) as unknown as FakeElement
    dom.dispatch(brandBtn, 'click')

    const pinBtn = titlebarEl.querySelector(
      'button[aria-label="Always on top"]',
    ) as unknown as FakeElement
    dom.dispatch(pinBtn, 'click')

    const themeBtn = titlebarEl.querySelector(
      '.titlebar-nav-actions .titlebar-button',
    ) as unknown as FakeElement
    dom.dispatch(themeBtn, 'click')

    const settingsBtn = titlebarEl.querySelector(
      'button[aria-label="Settings"]',
    ) as unknown as FakeElement
    dom.dispatch(settingsBtn, 'click')
    expect(ctx.layoutService.page).toBe('settings')
    expect(dom.document.title).toContain('Settings')

    const compactBtn = titlebarEl.querySelector(
      'button[aria-label="Compact view"]',
    ) as unknown as FakeElement
    dom.dispatch(compactBtn, 'click')
    expect(ctx.layoutService.compactMode).toBe(true)
    expect(navActions?.classList.contains('hidden')).toBe(true)

    const opacitySlider = titlebarEl.querySelector('.monaco-slider-input') as unknown as FakeElement
    opacitySlider.value = '70'
    dom.dispatch(opacitySlider, 'input')
    dom.dispatch(opacitySlider, 'change')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(ctx.configurationService.getValue('windowOpacity')).toBeCloseTo(0.7, 2)

    const winControls = titlebarEl.querySelectorAll(
      '.window-control-button',
    ) as unknown as FakeElement[]
    dom.dispatch(must(winControls[0]), 'click')
    dom.dispatch(must(winControls[1]), 'click')
    dom.dispatch(must(winControls[2]), 'click')
    expect(ctx.nativeHost.minimizeWindow).toHaveBeenCalledOnce()
    expect(ctx.nativeHost.toggleMaximizeWindow).toHaveBeenCalledOnce()
    expect(ctx.nativeHost.closeWindow).toHaveBeenCalledOnce()
  })

  it('renders StatusbarPart session, pinned count, prominent Zoom menu, update states, and theme switch', async () => {
    const ctx = await createWorkbenchTestContext(disposables)
    const statusbar = disposables.add(ctx.instantiationService.createInstance(StatusbarPart))
    statusbar.create(dom.container as unknown as HTMLElement)
    const statusbarEl = must(statusbar.element, 'statusbar element')

    const zoomItem = statusbarEl.querySelector(
      '.statusbar-item-prominent',
    ) as unknown as FakeElement
    expect(zoomItem.classList.contains('hidden')).toBe(true)

    await ctx.configurationService.updateConfiguration({ zoomLevel: 2 })
    expect(zoomItem.classList.contains('hidden')).toBe(false)
    expect(zoomItem.textContent).toContain('144%')

    dom.dispatch(zoomItem, 'click')
    const zoomMenu1 = dom.document.body.querySelectorAll('.monaco-menu-item')
    expect(zoomMenu1.length).toBeGreaterThanOrEqual(4)
    dom.dispatch(must(zoomMenu1[0]), 'click')
    await new Promise((resolve) => setTimeout(resolve, 10))
    dom.dispatch(zoomItem, 'click')
    const zoomMenu2 = dom.document.body.querySelectorAll('.monaco-menu-item')
    dom.dispatch(must(zoomMenu2[1]), 'click')
    await new Promise((resolve) => setTimeout(resolve, 10))
    dom.dispatch(zoomItem, 'click')
    const zoomMenu3 = dom.document.body.querySelectorAll('.monaco-menu-item')
    dom.dispatch(must(zoomMenu3[2]), 'click')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(ctx.configurationService.getValue('zoomLevel')).toBe(0)

    const themeStatusBtn = statusbarEl.querySelector(
      '.statusbar-item-theme',
    ) as unknown as FakeElement
    if (themeStatusBtn) {
      dom.dispatch(themeStatusBtn, 'click')
    }

    ctx.updateStateEmitter.fire({ state: 'checking' })
    ctx.updateStateEmitter.fire({ state: 'available', version: '2.1.0' })
    ctx.updateStateEmitter.fire({ state: 'downloading', version: '2.1.0', percent: 45 })
    ctx.updateStateEmitter.fire({ state: 'downloaded', version: '2.1.0' })
    ctx.updateStateEmitter.fire({ state: 'error', message: 'offline' })

    const updateBtn = statusbarEl.querySelector('.statusbar-item-update') as unknown as FakeElement
    expect(updateBtn.classList.contains('update-error')).toBe(true)
    dom.dispatch(updateBtn, 'click')
    expect(ctx.layoutService.page).toBe('settings')
    expect(ctx.layoutService.settingsSection).toBe('updates')
  })
})
