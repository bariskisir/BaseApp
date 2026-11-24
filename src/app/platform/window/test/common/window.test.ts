import { getZoomFactor, getZoomLevel, setZoomFactor, setZoomLevel } from '@app/base/browser/browser'
import { installFakeDom } from '@app/base/test/browser/fakeDom'
import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import {
  DEFAULT_AUXILIARY_BAR_STATE,
  DEFAULT_SIDEBAR_STATE,
  DEFAULT_TERTIARY_BAR_STATE,
  MAX_ZOOM_LEVEL,
  MIN_ZOOM_LEVEL,
  SIDEBAR_LIMITS,
  TERTIARY_BAR_LIMITS,
  VIEW_CONTAINER_LOCATIONS,
  clampSidebarWidth,
  clampTertiaryBarHeight,
  clampZoomLevel,
  getMaxSidebarWidth,
  getMaxTertiaryBarHeight,
  sidebarStateSchema,
  zoomFactorToZoomLevel,
  zoomLevelToZoomFactor,
} from '@app/platform/window/common/window'
import { applyZoom } from '@app/platform/window/electron-browser/window'
import { isAllowedRendererNavigation } from '@app/platform/window/electron-main/rendererNavigationPolicy'
import {
  TITLE_BAR_HEIGHT,
  resolveTitleBarOverlayOptions,
} from '@app/platform/window/electron-main/titleBarOverlay'
import { focusBrowserWindow } from '@app/platform/window/electron-main/windowFocus'
import {
  fitWindowBoundsToDisplays,
  parsePersistedWindowState,
} from '@app/platform/window/electron-main/windowState'
import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'

describe('platform window geometry, zoom, navigation policy, overlay, and focus helpers', () => {
  ensureNoDisposablesAreLeakedInTestSuite()

  it('computes exponential zoom levels and syncs preload webFrame zoom helpers', () => {
    expect(zoomLevelToZoomFactor(0)).toBe(1)
    expect(zoomLevelToZoomFactor(1)).toBeCloseTo(1.2, 6)
    expect(zoomLevelToZoomFactor(2)).toBeCloseTo(1.44, 6)
    expect(zoomLevelToZoomFactor(-1)).toBeCloseTo(1 / 1.2, 6)

    expect(clampZoomLevel(99)).toBe(MAX_ZOOM_LEVEL)
    expect(clampZoomLevel(-99)).toBe(MIN_ZOOM_LEVEL)
    expect(clampZoomLevel(Number.NaN)).toBe(0)
    expect(zoomFactorToZoomLevel(1.44)).toBe(2)
    expect(zoomFactorToZoomLevel(0)).toBe(0)
    expect(zoomFactorToZoomLevel(-1)).toBe(0)

    const dom = installFakeDom()
    const setZoomLevelMock = vi.fn()
    const setZoomFactorMock = vi.fn()
    dom.window.baseapp = {
      webFrame: {
        setZoomLevel: setZoomLevelMock,
        getZoomLevel: () => getZoomLevel(),
        setZoomFactor: setZoomFactorMock,
      },
    }
    try {
      setZoomLevel(0)
      setZoomFactor(1)
      expect(applyZoom(2)).toBe(2)
      expect(setZoomLevelMock).toHaveBeenCalledWith(2)
      expect(getZoomLevel()).toBe(2)
      expect(getZoomFactor()).toBeCloseTo(1.44, 5)
      expect(applyZoom(0)).toBe(0)

      dom.window.baseapp = { webFrame: { setZoomFactor: setZoomFactorMock } }
      expect(applyZoom(1)).toBe(1)
      expect(setZoomFactorMock).toHaveBeenCalled()
    } finally {
      dom.restore()
    }
  })

  it('defaults all three sidebars to minimum resizable sizes and clamps cooperatively', () => {
    expect(VIEW_CONTAINER_LOCATIONS).toEqual(['sidebar', 'auxiliarybar', 'tertiarybar'])
    expect(SIDEBAR_LIMITS.default).toBe(SIDEBAR_LIMITS.min)
    expect(TERTIARY_BAR_LIMITS.default).toBe(TERTIARY_BAR_LIMITS.min)
    expect(DEFAULT_SIDEBAR_STATE.width).toBe(170)
    expect(DEFAULT_AUXILIARY_BAR_STATE.width).toBe(170)
    expect(DEFAULT_TERTIARY_BAR_STATE.height).toBe(120)

    expect(getMaxSidebarWidth(1000, 200)).toBe(440)
    expect(clampSidebarWidth(100, 1000)).toBe(170)
    expect(clampSidebarWidth(900, 1000, 200)).toBe(440)
    expect(clampSidebarWidth(Number.NaN, 1000)).toBe(170)

    expect(getMaxTertiaryBarHeight(760)).toBe(540)
    expect(clampTertiaryBarHeight(60, 760)).toBe(120)
    expect(clampTertiaryBarHeight(900, 760)).toBe(540)
    expect(clampTertiaryBarHeight(Number.NaN, 760)).toBe(120)

    const parsedSidebar = sidebarStateSchema.parse({
      open: true,
      width: 170,
      compact: false,
      auxiliaryOpen: true,
      auxiliaryWidth: 200,
      tertiaryOpen: true,
      tertiaryHeight: 160,
      viewLocations: { 'workbench.view.sessions': 'tertiarybar' },
      activePrimaryViewId: 'a',
      activeAuxiliaryViewId: 'b',
      activeTertiaryViewId: 'workbench.view.sessions',
    })
    expect(parsedSidebar.tertiaryHeight).toBe(160)
  })

  it('validates persisted window state, display bounds, navigation policy, titleBarOverlay, and focus', () => {
    const valid = parsePersistedWindowState({
      revision: 1,
      bounds: { x: 10, y: 20, width: 1000, height: 700 },
      maximized: false,
      fullScreen: false,
      sidebar: { open: true, width: 170 },
      auxiliaryBar: { open: false, width: 170 },
      tertiaryBar: { open: true, height: 140 },
      activeTertiaryViewId: 'workbench.view.sessions',
      viewLocations: { 'workbench.view.sessions': 'tertiarybar' },
    })
    expect(valid?.tertiaryBar).toEqual({ open: true, height: 140 })
    expect(parsePersistedWindowState({ revision: 2 })).toBeNull()

    const workAreas = [{ x: 0, y: 0, width: 1920, height: 1080 }]
    expect(
      fitWindowBoundsToDisplays({ x: 1800, y: 900, width: 500, height: 400 }, workAreas),
    ).toEqual({ x: 1420, y: 680, width: 500, height: 400 })
    expect(
      fitWindowBoundsToDisplays({ x: 5000, y: 5000, width: 400, height: 300 }, workAreas),
    ).toBeNull()

    expect(
      isAllowedRendererNavigation('http://localhost:5173/index.html', {
        packagedRendererPath: '/app/index.html',
        devServerUrl: 'http://localhost:5173',
      }),
    ).toBe(true)
    expect(
      isAllowedRendererNavigation('https://evil.example', {
        packagedRendererPath: '/app/index.html',
        devServerUrl: 'http://localhost:5173',
      }),
    ).toBe(false)
    expect(
      isAllowedRendererNavigation('file:///C:/app/index.html', {
        packagedRendererPath: 'C:\\app\\index.html',
        platform: 'win32',
      }),
    ).toBe(true)
    expect(
      isAllowedRendererNavigation('file:///app/index.html', {
        packagedRendererPath: '/app/index.html',
        platform: 'linux',
      }),
    ).toBe(true)
    expect(
      isAllowedRendererNavigation('not-a-url', {
        packagedRendererPath: '/app/index.html',
      }),
    ).toBe(false)

    expect(TITLE_BAR_HEIGHT).toBe(35)
    expect(resolveTitleBarOverlayOptions('dark')).toEqual({
      color: '#181818',
      symbolColor: '#cccccc',
      height: 35,
    })
    expect(resolveTitleBarOverlayOptions('light')).toEqual({
      color: '#f8f8f8',
      symbolColor: '#1e1e1e',
      height: 35,
    })

    focusBrowserWindow(null)
    const show = vi.fn()
    const restore = vi.fn()
    const focus = vi.fn()
    focusBrowserWindow({
      isDestroyed: () => false,
      isMinimized: () => true,
      show,
      restore,
      focus,
    } as unknown as BrowserWindow)
    expect(show).toHaveBeenCalledOnce()
    expect(restore).toHaveBeenCalledOnce()
    expect(focus).toHaveBeenCalledOnce()
  })
})
