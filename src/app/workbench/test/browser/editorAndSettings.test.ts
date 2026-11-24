import {
  type FakeDomHarness,
  type FakeElement,
  installFakeDom,
} from '@app/base/test/browser/fakeDom'
import { ensureNoDisposablesAreLeakedInTestSuite, must } from '@app/base/test/common/utils'
import { EditorPart } from '@app/workbench/browser/parts/editor/editorPart'
import { createAboutSettingsView } from '@app/workbench/browser/parts/editor/settingsViews/aboutSettingsView'
import { createAppearanceSettingsView } from '@app/workbench/browser/parts/editor/settingsViews/appearanceSettingsView'
import { createGeneralSettingsView } from '@app/workbench/browser/parts/editor/settingsViews/generalSettingsView'
import { createPrivacyDataSettingsView } from '@app/workbench/browser/parts/editor/settingsViews/privacyDataSettingsView'
import { createSystemSettingsView } from '@app/workbench/browser/parts/editor/settingsViews/systemSettingsView'
import { createTraySettingsView } from '@app/workbench/browser/parts/editor/settingsViews/traySettingsView'
import { createUpdatesSettingsView } from '@app/workbench/browser/parts/editor/settingsViews/updatesSettingsView'
import '@app/workbench/contrib/settings/browser/settings.contribution'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createWorkbenchTestContext } from './workbenchTestServices'

describe('EditorPart, WelcomeEditorView, SettingsEditorView, and all 7 settings views', () => {
  let dom: FakeDomHarness

  beforeEach(() => {
    dom = installFakeDom()
  })

  afterEach(() => {
    dom.restore()
  })

  const disposables = ensureNoDisposablesAreLeakedInTestSuite()

  it('switches between Welcome and Settings tabs, searches settings, and closes Settings tab', async () => {
    const ctx = await createWorkbenchTestContext(disposables)
    const editor = disposables.add(ctx.instantiationService.createInstance(EditorPart))
    editor.create(dom.container as unknown as HTMLElement)
    const editorEl = must(editor.element)

    const welcomeButtons = editorEl.querySelectorAll(
      '.welcome-action-link',
    ) as unknown as FakeElement[]
    expect(welcomeButtons).toHaveLength(3)
    dom.dispatch(must(welcomeButtons[1]), 'click')
    expect(ctx.layoutService.page).toBe('settings')

    const tocItems = editorEl.querySelectorAll('.settings-toc-item') as unknown as FakeElement[]
    expect(tocItems).toHaveLength(7)
    dom.dispatch(must(tocItems[0]), 'keydown', { key: 'ArrowDown' })
    expect(ctx.layoutService.settingsSection).toBe('appearance')
    dom.dispatch(must(tocItems[1]), 'keydown', { key: 'End' })
    expect(ctx.layoutService.settingsSection).toBe('about')
    dom.dispatch(must(tocItems[6]), 'keydown', { key: 'Home' })
    expect(ctx.layoutService.settingsSection).toBe('general')

    const searchInput = editorEl.querySelector(
      '.settings-search-container .monaco-inputbox-input',
    ) as unknown as FakeElement
    searchInput.value = 'zoom'
    dom.dispatch(searchInput, 'input')
    const resultsBadge = editorEl.querySelector('.settings-results-count')
    expect(resultsBadge?.classList.contains('hidden')).toBe(false)

    searchInput.value = 'zzzz-no-such-setting'
    dom.dispatch(searchInput, 'input')
    expect(editorEl.querySelector('.settings-empty-state')?.classList.contains('hidden')).toBe(
      false,
    )

    dom.dispatch(searchInput, 'keydown', { key: 'Escape' })
    expect(searchInput.value).toBe('')

    const closeTabBtn = editorEl.querySelector('.editor-tab-close') as unknown as FakeElement
    dom.dispatch(closeTabBtn, 'click')
    expect(ctx.layoutService.page).toBe('home')
  })

  it('renders About view without hero buttons, Resources link list first, and System & Runtime at the bottom', async () => {
    const ctx = await createWorkbenchTestContext(disposables)
    const aboutView = disposables.add(
      ctx.instantiationService.invokeFunction((accessor) => createAboutSettingsView(accessor)),
    )

    const card = aboutView.element.querySelector('.settings-about-card')
    expect(card).not.toBeNull()
    expect(card?.querySelectorAll('button')).toHaveLength(0)

    const groups = aboutView.element.querySelectorAll('.settings-group')
    expect(groups).toHaveLength(2)
    expect(groups[0]?.querySelector('.settings-about-link-list')).not.toBeNull()
    expect(groups[1]?.querySelector('.settings-about-info-grid')).not.toBeNull()

    const links = aboutView.element.querySelectorAll(
      'a.settings-about-link',
    ) as unknown as FakeElement[]
    expect(links).toHaveLength(4)
    dom.dispatch(must(links[0]), 'click')
    expect(ctx.openExternalSpy).toHaveBeenCalledOnce()

    await new Promise((resolve) => setTimeout(resolve, 10))
    const infoValues = Array.from(aboutView.element.querySelectorAll('.settings-about-info-value'))
    expect(infoValues.some((el) => el.textContent?.includes('45.4.1'))).toBe(true)
    expect(infoValues.some((el) => el.textContent?.includes('Windows_NT 10.0 (x64)'))).toBe(true)
  })

  it('renders Appearance without navbarPosition and exercises General, Tray, Privacy, System, and Updates views', async () => {
    const ctx = await createWorkbenchTestContext(disposables)
    const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

    const appearance = disposables.add(
      ctx.instantiationService.invokeFunction((accessor) => createAppearanceSettingsView(accessor)),
    )
    dom.container.appendChild(appearance.element as unknown as FakeElement)
    expect(appearance.element.textContent.toLowerCase()).not.toContain('navbar position')

    const themeButtons = Array.from(
      appearance.element.querySelectorAll('.monaco-segmented-option'),
    ) as unknown as FakeElement[]
    dom.dispatch(must(themeButtons[0]), 'click')
    await flush()
    expect(ctx.configurationService.getValue('theme')).toBe('light')
    dom.dispatch(must(themeButtons[2]), 'click')
    await flush()
    expect(ctx.configurationService.getValue('theme')).toBe('system')
    dom.dispatch(must(themeButtons[4]), 'click')
    await flush()
    expect(ctx.configurationService.getValue('sideBarLocation')).toBe('right')

    const clickCheckbox = (root: HTMLElement, ariaLabel: string): void => {
      const box = root.querySelector(
        `[role="checkbox"][aria-label="${ariaLabel}"]`,
      ) as unknown as FakeElement
      dom.dispatch(box, 'click', { bubbles: true })
    }

    clickCheckbox(appearance.element, 'Show status bar')
    await flush()
    expect(ctx.configurationService.getValue('statusBarVisible')).toBe(false)

    const zoomInBtn = appearance.element.querySelector(
      'button[aria-label="Zoom in"]',
    ) as unknown as FakeElement
    dom.dispatch(zoomInBtn, 'click')
    await flush()
    expect(ctx.configurationService.getValue('zoomLevel')).toBe(1)

    const zoomOutBtn = appearance.element.querySelector(
      'button[aria-label="Zoom out"]',
    ) as unknown as FakeElement
    dom.dispatch(zoomOutBtn, 'click')
    await flush()
    expect(ctx.configurationService.getValue('zoomLevel')).toBe(0)

    const zoomResetBtn = appearance.element.querySelector(
      'button[aria-label="Reset zoom"]',
    ) as unknown as FakeElement
    dom.dispatch(zoomInBtn, 'click')
    await flush()
    dom.dispatch(zoomResetBtn, 'click')
    await flush()
    expect(ctx.configurationService.getValue('zoomLevel')).toBe(0)

    const opacityRange = appearance.element.querySelector(
      '.monaco-slider-input',
    ) as unknown as FakeElement
    opacityRange.value = '80'
    dom.dispatch(opacityRange, 'input')
    dom.dispatch(opacityRange, 'change')
    await flush()
    expect(ctx.configurationService.getValue('windowOpacity')).toBeCloseTo(0.8, 2)

    clickCheckbox(appearance.element, 'Always on top')
    await flush()
    expect(ctx.configurationService.getValue('alwaysOnTop')).toBe(true)

    const resetLayoutBtn = Array.from(
      appearance.element.querySelectorAll('.monaco-text-button'),
    ).find((btn) => btn.textContent?.includes('Reset layout')) as unknown as FakeElement
    dom.dispatch(resetLayoutBtn, 'click')
    await flush()
    expect(ctx.nativeHost.resetWindowLayout).toHaveBeenCalledOnce()

    const resetAllIn = async (root: HTMLElement): Promise<void> => {
      for (const resetIcon of Array.from(
        root.querySelectorAll('.setting-item-reset-slot button'),
      ) as unknown as FakeElement[]) {
        dom.dispatch(resetIcon, 'click')
        await flush()
      }
    }

    await resetAllIn(appearance.element)

    const general = disposables.add(
      ctx.instantiationService.invokeFunction((accessor) => createGeneralSettingsView(accessor)),
    )
    dom.container.appendChild(general.element as unknown as FakeElement)
    expect(general.groups.length).toBeGreaterThan(0)

    const selectTriggers = Array.from(
      general.element.querySelectorAll('.monaco-select-box'),
    ) as unknown as FakeElement[]
    for (const trigger of selectTriggers) {
      dom.dispatch(trigger, 'click')
      const options = dom.document.body.querySelectorAll('.monaco-select-box-option')
      if (options[1]) {
        dom.dispatch(options[1], 'click')
      }
      await flush()
    }
    clickCheckbox(general.element, 'Launch at startup')
    await flush()
    expect(ctx.configurationService.getValue('launchAtStartup')).toBe(true)
    await resetAllIn(general.element)

    const tray = disposables.add(
      ctx.instantiationService.invokeFunction((accessor) => createTraySettingsView(accessor)),
    )
    dom.container.appendChild(tray.element as unknown as FakeElement)
    expect(tray.groups.length).toBeGreaterThan(0)

    clickCheckbox(tray.element, 'Minimize to tray on close')
    await flush()
    expect(ctx.configurationService.getValue('minimizeToTrayOnClose')).toBe(true)
    expect(ctx.configurationService.getValue('showTrayIcon')).toBe(true)

    const trayIconTrigger = tray.element.querySelector(
      '.monaco-select-box',
    ) as unknown as FakeElement
    dom.dispatch(trayIconTrigger, 'click')
    const trayOpts = dom.document.body.querySelectorAll('.monaco-select-box-option')
    if (trayOpts[1]) {
      dom.dispatch(trayOpts[1], 'click')
    }
    await flush()

    clickCheckbox(tray.element, 'Start minimized')
    await flush()
    expect(ctx.configurationService.getValue('startMinimized')).toBe(true)

    clickCheckbox(tray.element, 'Show tray icon')
    await flush()
    expect(ctx.configurationService.getValue('showTrayIcon')).toBe(false)
    expect(ctx.configurationService.getValue('minimizeToTrayOnClose')).toBe(false)

    clickCheckbox(tray.element, 'Show in taskbar')
    await flush()
    expect(
      tray.element.querySelector('.settings-inline-notice')?.classList.contains('hidden'),
    ).toBe(false)
    await resetAllIn(tray.element)

    const privacy = disposables.add(
      ctx.instantiationService.invokeFunction((accessor) =>
        createPrivacyDataSettingsView(accessor),
      ),
    )
    dom.container.appendChild(privacy.element as unknown as FakeElement)
    expect(privacy.groups.length).toBeGreaterThan(0)

    clickCheckbox(privacy.element, 'Content protection')
    await flush()
    clickCheckbox(privacy.element, 'Anonymous startup telemetry')
    await flush()
    expect(ctx.configurationService.getValue('contentProtection')).toBe(false)
    expect(ctx.configurationService.getValue('telemetryEnabled')).toBe(true)

    const clickButtonByText = (root: HTMLElement, text: string): void => {
      const btn = Array.from(root.querySelectorAll('.monaco-text-button')).find((el) =>
        el.textContent?.includes(text),
      ) as unknown as FakeElement
      dom.dispatch(btn, 'click')
    }

    clickButtonByText(privacy.element, 'Export')
    await flush()
    clickButtonByText(privacy.element, 'Import')
    await flush()
    clickButtonByText(privacy.element, 'Open folder')
    await flush()
    expect(ctx.nativeHost.exportConfiguration).toHaveBeenCalledOnce()
    expect(ctx.nativeHost.importConfiguration).toHaveBeenCalledOnce()
    expect(ctx.nativeHost.openDataDirectory).toHaveBeenCalledOnce()

    clickButtonByText(privacy.element, 'Reset')
    await flush()
    const confirmResetBtn = dom.document.body.querySelector(
      '.monaco-dialog-buttons .monaco-button-danger',
    ) as unknown as FakeElement
    dom.dispatch(confirmResetBtn, 'click')
    await flush()
    expect(ctx.configurationService.getValue('contentProtection')).toBe(true)

    await resetAllIn(privacy.element)

    const system = disposables.add(
      ctx.instantiationService.invokeFunction((accessor) => createSystemSettingsView(accessor)),
    )
    dom.container.appendChild(system.element as unknown as FakeElement)
    await flush()
    expect(system.groups.length).toBeGreaterThan(0)

    clickCheckbox(system.element, 'Hardware acceleration')
    await flush()
    expect(ctx.configurationService.getValue('hardwareAcceleration')).toBe(false)

    const restartBtn = system.element.querySelector(
      '.settings-inline-notice .monaco-text-button',
    ) as unknown as FakeElement
    dom.dispatch(restartBtn, 'click')
    await flush()
    expect(ctx.nativeHost.relaunch).toHaveBeenCalledOnce()

    const logLevelTrigger = system.element.querySelector(
      '.monaco-select-box',
    ) as unknown as FakeElement
    dom.dispatch(logLevelTrigger, 'click')
    const logLevelOpts = dom.document.body.querySelectorAll('.monaco-select-box-option')
    if (logLevelOpts[0]) {
      dom.dispatch(logLevelOpts[0], 'click')
    }
    await flush()

    clickButtonByText(system.element, 'Open')
    await flush()
    expect(ctx.nativeHost.openLogsDirectory).toHaveBeenCalledOnce()

    clickButtonByText(system.element, 'Clear')
    await flush()
    const confirmClearBtn = dom.document.body.querySelector(
      '.monaco-dialog-buttons .monaco-button-danger',
    ) as unknown as FakeElement
    dom.dispatch(confirmClearBtn, 'click')
    await flush()

    await resetAllIn(system.element)

    const updates = disposables.add(
      ctx.instantiationService.invokeFunction((accessor) => createUpdatesSettingsView(accessor)),
    )
    dom.container.appendChild(updates.element as unknown as FakeElement)

    clickCheckbox(updates.element, 'Auto unattended updates')
    await flush()
    clickCheckbox(updates.element, 'Check on startup')
    await flush()
    expect(ctx.configurationService.getValue('autoUpdate')).toBe(false)
    await resetAllIn(updates.element)

    clickButtonByText(updates.element, 'Check for updates')
    await flush()

    ctx.updateStateEmitter.fire({ state: 'checking' })
    ctx.updateStateEmitter.fire({
      state: 'available',
      version: '2.1.0',
      pageUrl: 'https://github.com/bariskisir/BaseApp/releases/latest',
      releaseNotes: 'Changelog details',
    })
    expect(updates.element.textContent).toContain('Changelog details')
    clickButtonByText(updates.element, 'Open download page')
    await flush()
    expect(ctx.openExternalSpy).toHaveBeenCalled()

    ctx.updateStateEmitter.fire({ state: 'downloading', version: '2.1.0', percent: 45 })
    ctx.updateStateEmitter.fire({ state: 'downloaded', version: '2.1.0' })
    clickButtonByText(updates.element, 'Install now')
    await flush()

    ctx.updateStateEmitter.fire({ state: 'error', message: 'Offline' })
    ctx.updateStateEmitter.fire({ state: 'idle' })
  })
})
