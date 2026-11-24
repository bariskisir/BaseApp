import { toDisposable } from '@app/base/common/lifecycle'
import type { ISandboxIpcRenderer } from '@app/base/parts/sandbox/common/sandboxTypes'
import { type FakeDomHarness, installFakeDom } from '@app/base/test/browser/fakeDom'
import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import { DEFAULT_CONFIGURATION } from '@app/platform/configuration/common/configuration'
import { ColorScheme } from '@app/platform/theme/common/theme'
import { getColorRegistry } from '@app/platform/theme/common/colorRegistry'
import { getThemingRegistry } from '@app/platform/theme/common/themeService'
import {
  DEFAULT_AUXILIARY_BAR_STATE,
  DEFAULT_SIDEBAR_STATE,
  DEFAULT_TERTIARY_BAR_STATE,
} from '@app/platform/window/common/window'
import '@app/workbench/browser/style'
import '@app/workbench/electron-browser/workbench.desktop.main'
import {
  type WorkbenchContributionsRegistry,
  getWorkbenchContributionsRegistry,
} from '@app/workbench/common/contributions'
import { DesktopMain } from '@app/workbench/electron-browser/desktop.main'
import { MainProcessService } from '@app/workbench/services/ipc/electron-browser/mainProcessService'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function createFakeSandboxIpc(failVersion = false): ISandboxIpcRenderer {
  return {
    invoke: vi.fn(async (_channel: string, request?: unknown) => {
      const req = request as { channelName?: string; name?: string } | undefined
      const channelName = req?.channelName ?? ''
      const method = req?.name ?? ''

      if (channelName === 'nativeHost') {
        if (method === 'getVersion') {
          if (failVersion) {
            throw new Error('version unavailable')
          }
          return '2.0.0'
        }
        if (method === 'getPlatform') {
          return 'win32'
        }
        if (method === 'getRuntimeInfo') {
          return {
            appVersion: '2.0.0',
            electron: '45.4.1',
            chromium: '148.0',
            node: '24.0',
            v8: '14.0',
            os: 'Windows_NT 10.0 (x64)',
          }
        }
        if (method === 'isWindowMaximized' || method === 'isWindowFullScreen') {
          return false
        }
        if (method === 'getWindowLayoutState') {
          return {
            sidebar: { ...DEFAULT_SIDEBAR_STATE },
            auxiliaryBar: { ...DEFAULT_AUXILIARY_BAR_STATE },
            tertiaryBar: { ...DEFAULT_TERTIARY_BAR_STATE },
            compactMode: false,
            viewLocations: {},
          }
        }
        return undefined
      }

      if (channelName === 'configuration') {
        return { ...DEFAULT_CONFIGURATION }
      }
      if (channelName === 'theme') {
        return { dark: true }
      }
      if (channelName === 'sessions') {
        if (method === 'listSessions') {
          return []
        }
        if (method === 'createSession') {
          return {
            id: 's1',
            title: '',
            createdAt: 1000,
            updatedAt: 1000,
            pinned: false,
          }
        }
        return undefined
      }
      if (channelName === 'update') {
        return { state: 'idle' }
      }
      if (channelName === 'log') {
        if (method === 'getLogsSummary') {
          return { fileCount: 0, totalBytes: 0 }
        }
        return undefined
      }
      return undefined
    }),
    send: vi.fn(),
    on: vi.fn(() => () => undefined),
    removeListener: vi.fn(),
  }
}

describe('MainProcessService, DesktopMain, and workbench theme styling participant', () => {
  let dom: FakeDomHarness

  beforeEach(() => {
    dom = installFakeDom()
  })

  afterEach(() => {
    dom.restore()
  })

  const disposables = ensureNoDisposablesAreLeakedInTestSuite()

  it('wraps sandbox IPC in MainProcessService and boots DesktopMain including beforeunload disposal', async () => {
    const fakeIpc = createFakeSandboxIpc(true)
    ;(globalThis as unknown as { window: { baseapp?: unknown } }).window.baseapp = {
      ipcRenderer: fakeIpc,
      webFrame: {
        setZoomLevel: vi.fn(),
        getZoomLevel: () => 0,
      },
    }

    const mainProcessService = disposables.add(new MainProcessService(fakeIpc))
    const channel = mainProcessService.getChannel('configuration')
    expect(await channel.call('getConfiguration')).toEqual(DEFAULT_CONFIGURATION)

    disposables.add(
      toDisposable(() => {
        ;(getWorkbenchContributionsRegistry() as WorkbenchContributionsRegistry).clearForTest()
      }),
    )

    const root = dom.document.createElement('div')
    dom.document.body.appendChild(root)
    const desktopMain = disposables.add(new DesktopMain(root as unknown as HTMLElement))
    await desktopMain.open()

    expect(root.querySelector('.monaco-workbench')).not.toBeNull()
    expect(root.querySelector('.part.tertiarybar')).not.toBeNull()

    dom.dispatch(dom.window, 'beforeunload')
    expect(desktopMain.isDisposed).toBe(true)
  })

  it('generates workbench body, selection, and link CSS rules from registered theme participant', () => {
    const colorRegistry = getColorRegistry()
    const rules: string[] = []
    const darkTheme = {
      type: ColorScheme.Dark,
      label: 'Dark',
      getColor: (id: string) => colorRegistry.resolveDefaultColor(id, darkTheme),
      defines: () => true,
    }

    for (const participant of getThemingRegistry().getThemingParticipants()) {
      participant(darkTheme, { addRule: (rule) => rules.push(rule) })
    }

    expect(rules.some((rule) => rule.includes('.monaco-workbench'))).toBe(true)
    expect(rules.some((rule) => rule.includes('::selection'))).toBe(true)
    expect(rules.some((rule) => rule.includes('a:hover'))).toBe(true)

    const bgOnlyRules: string[] = []
    const bgOnlyTheme = {
      type: ColorScheme.Dark,
      label: 'Dark',
      getColor: (id: string) =>
        id === 'workbench.background'
          ? colorRegistry.resolveDefaultColor(id, darkTheme)
          : undefined,
      defines: (id: string) => id === 'workbench.background',
    }
    for (const participant of getThemingRegistry().getThemingParticipants()) {
      participant(bgOnlyTheme, { addRule: (rule) => bgOnlyRules.push(rule) })
    }
    expect(bgOnlyRules.some((rule) => rule.includes('body, .monaco-workbench'))).toBe(true)
  })
})
