import { toDisposable } from '@app/base/common/lifecycle'
import {
  type FakeDomHarness,
  type FakeElement,
  installFakeDom,
} from '@app/base/test/browser/fakeDom'
import { ensureNoDisposablesAreLeakedInTestSuite, must } from '@app/base/test/common/utils'
import { ServiceCollection } from '@app/platform/instantiation/common/serviceCollection'
import { IMainProcessService } from '@app/workbench/services/ipc/electron-browser/mainProcessService'
import { INativeHostService } from '@app/platform/native/common/native'
import { IProductService, ProductService } from '@app/platform/product/common/productService'
import { NotificationsPart } from '@app/workbench/browser/parts/notifications/notificationsPart'
import { StartupOverlay } from '@app/workbench/browser/parts/notifications/startupOverlay'
import { Workbench } from '@app/workbench/browser/workbench'
import {
  type WorkbenchContributionsRegistry,
  getWorkbenchContributionsRegistry,
} from '@app/workbench/common/contributions'
import { SESSIONS_COMMANDS } from '@app/workbench/contrib/sessions/browser/sessions.contribution'
import {
  SessionsView,
  createSessionsView,
} from '@app/workbench/contrib/sessions/browser/sessionsView'
import {
  WINDOW_COMMANDS,
  WindowWorkbenchContribution,
} from '@app/workbench/contrib/window/browser/window.contribution'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkbenchTestContext } from './workbenchTestServices'

describe('NotificationsPart, StartupOverlay, SessionsView, WindowWorkbenchContribution, and Workbench', () => {
  let dom: FakeDomHarness

  beforeEach(() => {
    dom = installFakeDom()
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  const disposables = ensureNoDisposablesAreLeakedInTestSuite()

  it('displays and dismisses transient and update notifications and StartupOverlay states', async () => {
    const ctx = await createWorkbenchTestContext(disposables)
    const notificationsPart = disposables.add(
      ctx.instantiationService.createInstance(NotificationsPart),
    )
    notificationsPart.create(dom.container as unknown as HTMLElement)
    const notificationsEl = must(notificationsPart.element)

    vi.useFakeTimers()
    ctx.notificationService.success('Saved cleanly')
    expect(notificationsEl.querySelectorAll('.notification-toast')).toHaveLength(1)
    vi.advanceTimersByTime(4_100)
    expect(notificationsEl.querySelectorAll('.notification-toast')).toHaveLength(0)

    ctx.updateStateEmitter.fire({ state: 'downloading', version: '2.1.0', percent: 30 })
    ctx.updateStateEmitter.fire({ state: 'downloading', version: '2.1.0', percent: 75 })
    expect(notificationsEl.textContent).toContain('75%')

    ctx.updateStateEmitter.fire({ state: 'downloaded', version: '2.1.0' })
    const installBtn = notificationsEl.querySelector(
      '.notification-toast-actions .monaco-text-button',
    ) as unknown as FakeElement
    expect(installBtn).not.toBeNull()
    dom.dispatch(installBtn, 'click')

    ctx.updateStateEmitter.fire({
      state: 'available',
      version: '2.2.0',
      pageUrl: 'https://github.com/bariskisir/BaseApp/releases/latest',
    })
    const openBtn = notificationsEl.querySelector(
      '.notification-toast-actions .monaco-text-button',
    ) as unknown as FakeElement
    dom.dispatch(openBtn, 'click')
    expect(ctx.openExternalSpy).toHaveBeenCalledOnce()

    const dismissBtn = notificationsEl.querySelector(
      '.notification-toast-dismiss',
    ) as unknown as FakeElement
    dom.dispatch(dismissBtn, 'click')

    const overlay = disposables.add(new StartupOverlay(dom.container as unknown as HTMLElement))
    overlay.showLoading('Booting...')
    expect(overlay.element.classList.contains('hidden')).toBe(false)
    let retried = false
    overlay.showError('Failed', 'Retry', () => {
      retried = true
    })
    const retryBtn = overlay.element.querySelector('.monaco-text-button') as unknown as FakeElement
    dom.dispatch(retryBtn, 'click')
    expect(retried).toBe(true)
    overlay.hide()
    expect(overlay.element.classList.contains('hidden')).toBe(true)
  })

  it('operates SessionsView search, selection, context menu, and header actions', async () => {
    const ctx = await createWorkbenchTestContext(disposables)
    const view = disposables.add(ctx.instantiationService.createInstance(SessionsView))
    dom.container.appendChild(view.element as unknown as FakeElement)

    expect(view.getHeaderActions().map((item) => item.id)).toEqual([
      'sessions-new',
      'sessions-delete-all',
    ])

    const rows = view.element.querySelectorAll('.sidebar-session-row')
    expect(rows).toHaveLength(2)

    const searchInput = view.element.querySelector(
      '.monaco-inputbox-input',
    ) as unknown as FakeElement
    searchInput.value = 'Alpha'
    dom.dispatch(searchInput, 'input')
    expect(view.element.querySelectorAll('.sidebar-session-row')).toHaveLength(1)

    searchInput.value = 'NoMatch'
    dom.dispatch(searchInput, 'input')
    expect(view.element.querySelector('.sessions-view-empty')).not.toBeNull()

    dom.dispatch(searchInput, 'keydown', { key: 'Escape' })
    expect(view.element.querySelectorAll('.sidebar-session-row')).toHaveLength(2)

    const firstRow = view.element.querySelector('.sidebar-session-row') as unknown as FakeElement
    dom.dispatch(firstRow, 'contextmenu', { clientX: 20, clientY: 20 })
    const contextItems = dom.document.body.querySelectorAll('.monaco-menu-item')
    expect(contextItems).toHaveLength(3)
    dom.dispatch(must(contextItems[0]), 'click')
    await new Promise((resolve) => setTimeout(resolve, 10))

    const openBtn = view.element.querySelector('.sidebar-session-open') as unknown as FakeElement
    dom.dispatch(openBtn, 'click')
    dom.dispatch(openBtn, 'dblclick')
    await new Promise((resolve) => setTimeout(resolve, 10))
    const promptInput = dom.document.body.querySelector(
      '.monaco-dialog-input-container .monaco-inputbox-input',
    ) as unknown as FakeElement
    promptInput.value = 'Renamed Session'
    dom.dispatch(promptInput, 'input')
    const saveBtn = dom.document.body.querySelector(
      '.monaco-dialog-buttons .monaco-button-primary',
    ) as unknown as FakeElement
    dom.dispatch(saveBtn, 'click')
    await new Promise((resolve) => setTimeout(resolve, 10))

    const deleteBtn = view.element.querySelector(
      '.sidebar-session-delete',
    ) as unknown as FakeElement
    dom.dispatch(deleteBtn, 'click')
    await new Promise((resolve) => setTimeout(resolve, 10))

    const viaFactory = disposables.add(
      ctx.instantiationService.invokeFunction((accessor) => createSessionsView(accessor)),
    )
    expect(viaFactory.id).toBe('workbench.view.sessions')

    await ctx.commandService.executeCommand(SESSIONS_COMMANDS.newSession, 'Command Session')
    const createdId = ctx.sessionsService.currentSession?.id
    expect(createdId).toBeTruthy()
    await ctx.commandService.executeCommand(SESSIONS_COMMANDS.open, createdId)
    await ctx.commandService.executeCommand(SESSIONS_COMMANDS.open, 123)
    expect(
      await ctx.commandService.executeCommand(SESSIONS_COMMANDS.rename, createdId, 'Updated'),
    ).toBe(true)
    expect(await ctx.commandService.executeCommand(SESSIONS_COMMANDS.rename, 123, 456)).toBe(false)
    await ctx.commandService.executeCommand(SESSIONS_COMMANDS.togglePin, createdId, true)
    expect(await ctx.commandService.executeCommand(SESSIONS_COMMANDS.togglePin, 123, 'bad')).toBe(
      false,
    )
    await ctx.commandService.executeCommand(SESSIONS_COMMANDS.delete, 123)
    await ctx.commandService.executeCommand(SESSIONS_COMMANDS.delete, createdId)
    await ctx.commandService.executeCommand(SESSIONS_COMMANDS.deleteAll)

    const actions = view.getHeaderActions()
    actions[0]?.run()
    await new Promise((resolve) => setTimeout(resolve, 10))
    actions[1]?.run()
    await new Promise((resolve) => setTimeout(resolve, 10))
    const confirmDeleteAll = dom.document.body.querySelector(
      '.monaco-dialog-buttons .monaco-button-danger',
    ) as unknown as FakeElement
    if (confirmDeleteAll) {
      dom.dispatch(confirmDeleteAll, 'click')
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    view.focus()
  })

  it('handles WindowWorkbenchContribution keyboard shortcuts including Ctrl+J for Tertiary Side Bar and zoom', async () => {
    const ctx = await createWorkbenchTestContext(disposables)
    disposables.add(ctx.instantiationService.createInstance(WindowWorkbenchContribution))

    dom.dispatch(dom.window, 'keydown', { key: 'b', ctrlKey: true })
    expect(ctx.layoutService.sidebarOpen).toBe(false)

    dom.dispatch(dom.window, 'keydown', { key: 'b', ctrlKey: true, altKey: true })
    expect(ctx.layoutService.auxiliaryBarOpen).toBe(true)

    dom.dispatch(dom.window, 'keydown', { key: 'j', ctrlKey: true })
    expect(ctx.layoutService.tertiaryBarOpen).toBe(true)

    dom.dispatch(dom.window, 'keydown', { key: '=', ctrlKey: true })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(ctx.configurationService.getValue('zoomLevel')).toBe(1)

    dom.dispatch(dom.window, 'keydown', { key: '-', ctrlKey: true })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(ctx.configurationService.getValue('zoomLevel')).toBe(0)

    dom.dispatch(dom.window, 'keydown', { key: ',', ctrlKey: true })
    expect(ctx.layoutService.page).toBe('settings')

    await ctx.commandService.executeCommand(WINDOW_COMMANDS.cycleTheme)
    expect(ctx.configurationService.getValue('theme')).toBe('light')
    await ctx.commandService.executeCommand(WINDOW_COMMANDS.toggleAlwaysOnTop)
    expect(ctx.configurationService.getValue('alwaysOnTop')).toBe(true)
    await ctx.commandService.executeCommand(WINDOW_COMMANDS.toggleSideBarPosition)
    expect(ctx.configurationService.getValue('sideBarLocation')).toBe('right')
    await ctx.commandService.executeCommand(WINDOW_COMMANDS.toggleStatusBar)
    expect(ctx.configurationService.getValue('statusBarVisible')).toBe(false)
    await ctx.commandService.executeCommand(WINDOW_COMMANDS.toggleCompactMode)
    expect(ctx.layoutService.compactMode).toBe(true)
    await ctx.commandService.executeCommand(WINDOW_COMMANDS.toggleCompactMode)
    await ctx.commandService.executeCommand(WINDOW_COMMANDS.toggleFullScreen)
    expect(ctx.nativeHost.toggleFullScreen).toHaveBeenCalledOnce()
    await ctx.commandService.executeCommand(WINDOW_COMMANDS.zoomIn)
    await ctx.commandService.executeCommand(WINDOW_COMMANDS.zoomOut)
    await ctx.commandService.executeCommand(WINDOW_COMMANDS.zoomReset)
    await ctx.commandService.executeCommand(WINDOW_COMMANDS.resetLayout)
    await ctx.commandService.executeCommand(WINDOW_COMMANDS.relaunch)
    expect(ctx.nativeHost.relaunch).toHaveBeenCalledOnce()

    dom.dispatch(dom.window, 'keydown', { key: '0', ctrlKey: true })
    ctx.maximizedEmitter.fire(true)
    expect(ctx.layoutService.maximized).toBe(true)
    ctx.fullScreenEmitter.fire(true)
    expect(ctx.layoutService.fullScreen).toBe(true)
    ctx.layoutService.setPage('home')
    ctx.openSettingsEmitter.fire()
    expect(ctx.layoutService.page).toBe('settings')

    const inputEl = dom.document.createElement('input')
    dom.document.body.appendChild(inputEl)
    const beforeSidebar = ctx.layoutService.sidebarOpen
    dom.dispatch(inputEl, 'keydown', { key: 'b', ctrlKey: true, bubbles: true })
    expect(ctx.layoutService.sidebarOpen).toBe(beforeSidebar)
  })

  it('mounts the full 3-sidebar Workbench shell without ActivityBar and completes bootstrap', async () => {
    const ctx = await createWorkbenchTestContext(disposables)
    const services = new ServiceCollection(
      [IMainProcessService, ctx.instantiationService.get(IMainProcessService)],
      [INativeHostService, ctx.nativeHost],
      [IProductService, new ProductService('2.0.0')],
    )

    const root = dom.document.createElement('div')
    dom.document.body.appendChild(root)
    disposables.add(
      toDisposable(() => {
        ;(getWorkbenchContributionsRegistry() as WorkbenchContributionsRegistry).clearForTest()
      }),
    )
    const workbench = disposables.add(new Workbench(root as unknown as HTMLElement, services))
    await workbench.startup()

    expect(root.querySelector('.part.titlebar')).not.toBeNull()
    expect(root.querySelector('.part.activitybar')).toBeNull()
    expect(root.querySelector('.part.sidebar')).not.toBeNull()
    expect(root.querySelector('.monaco-workbench-center')).not.toBeNull()
    expect(root.querySelector('.part.editor')).not.toBeNull()
    expect(root.querySelector('.part.tertiarybar')).not.toBeNull()
    expect(root.querySelector('.part.auxiliarybar')).not.toBeNull()
    expect(root.querySelector('.part.statusbar')).not.toBeNull()
    expect(root.querySelector('.part.notifications')).not.toBeNull()
    expect(root.querySelector('.startup-overlay')?.classList.contains('hidden')).toBe(true)
  })
})
