import {
  ActionBar,
  Button,
  Checkbox,
  InputBox,
  ProgressBar,
  Sash,
  SegmentedControl,
  SelectBox,
  Slider,
  attachTooltip,
  hideActiveContextMenu,
  hideActiveTooltip,
  showConfirmDialog,
  showContextMenu,
  showPromptDialog,
} from '@app/base/browser/ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureNoDisposablesAreLeakedInTestSuite, must } from '../common/utils'
import { type FakeDomHarness, type FakeElement, installFakeDom } from './fakeDom'

describe('base browser UI widgets', () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite()
  let dom: FakeDomHarness

  beforeEach(() => {
    dom = installFakeDom()
  })

  afterEach(() => {
    hideActiveContextMenu()
    hideActiveTooltip()
    vi.useRealTimers()
    dom.restore()
  })

  it('operates Button across variants, loading/disabled states, icons, labels, and tooltips', () => {
    const clicks: number[] = []
    const button = disposables.add(
      new Button(dom.container as unknown as HTMLElement, {
        label: 'Save',
        icon: 'check',
        variant: 'primary',
        small: true,
        title: 'Save changes',
        ariaPressed: false,
      }),
    )
    disposables.add(button.onDidClick(() => clicks.push(1)))

    dom.dispatch(button.element as unknown as FakeElement, 'click')
    expect(clicks).toHaveLength(1)

    button.setLoading(true)
    expect(button.element.getAttribute('aria-busy')).toBe('true')
    dom.dispatch(button.element as unknown as FakeElement, 'click')
    expect(clicks).toHaveLength(1)

    button.setLoading(false)
    button.setEnabled(false)
    dom.dispatch(button.element as unknown as FakeElement, 'click')
    expect(clicks).toHaveLength(1)

    button.setEnabled(true)
    button.setLabel(undefined)
    button.setIcon(undefined)
    button.setTitle('Icon-less tooltip')
    expect(button.element.getAttribute('aria-label')).toBe('Icon-less tooltip')
    button.setAriaPressed(true)
    expect(button.element.getAttribute('aria-pressed')).toBe('true')
    button.setAriaPressed(undefined)
    expect(button.element.hasAttribute('aria-pressed')).toBe(false)
    button.focus()
  })

  it('toggles Checkbox via click, keyboard, programmatic value, and disabled state', () => {
    const changes: boolean[] = []
    const checkbox = disposables.add(
      new Checkbox(dom.container as unknown as HTMLElement, {
        checked: false,
        label: 'Enable feature',
        tooltip: 'Toggle option',
      }),
    )
    disposables.add(checkbox.onDidChange((value) => changes.push(value)))

    dom.dispatch(checkbox.element as unknown as FakeElement, 'click')
    expect(checkbox.checked).toBe(true)
    const box = checkbox.element.querySelector('.monaco-checkbox') as unknown as FakeElement
    dom.dispatch(box, 'keydown', { key: ' ' })
    expect(checkbox.checked).toBe(false)
    dom.dispatch(box, 'keydown', { key: 'Enter' })
    expect(checkbox.checked).toBe(true)

    checkbox.setDisabled(true)
    dom.dispatch(checkbox.element as unknown as FakeElement, 'click')
    dom.dispatch(box, 'keydown', { key: ' ' })
    expect(checkbox.checked).toBe(true)

    checkbox.checked = false
    expect(checkbox.checked).toBe(false)
    expect(changes).toEqual([true, false, true])
  })

  it('handles InputBox typing, clear button, Enter submit, Escape, and disabled state', () => {
    const changed: string[] = []
    const submitted: string[] = []
    let escaped = 0

    const inputBox = disposables.add(
      new InputBox(dom.container as unknown as HTMLElement, {
        placeholder: 'Search…',
        value: 'hello',
        prefixIcon: 'search',
        allowClear: true,
      }),
    )
    disposables.add(inputBox.onDidChange((value) => changed.push(value)))
    disposables.add(inputBox.onDidSubmit((value) => submitted.push(value)))
    disposables.add(
      inputBox.onDidEscape(() => {
        escaped += 1
      }),
    )

    expect(inputBox.value).toBe('hello')
    inputBox.inputElement.value = 'world'
    dom.dispatch(inputBox.inputElement as unknown as FakeElement, 'input')
    dom.dispatch(inputBox.inputElement as unknown as FakeElement, 'keydown', { key: 'Enter' })
    dom.dispatch(inputBox.inputElement as unknown as FakeElement, 'keydown', { key: 'Escape' })

    const clearBtn = inputBox.element.querySelector(
      '.monaco-inputbox-clear',
    ) as unknown as FakeElement
    dom.dispatch(clearBtn, 'mousedown')
    dom.dispatch(clearBtn, 'click')
    expect(inputBox.value).toBe('')

    inputBox.value = 'reset'
    inputBox.setPlaceholder('New placeholder')
    inputBox.focus()
    inputBox.select()
    inputBox.setDisabled(true)
    dom.dispatch(clearBtn, 'click')

    expect(changed).toEqual(['world', ''])
    expect(submitted).toEqual(['world'])
    expect(escaped).toBe(1)
  })

  it('renders discrete, indeterminate, and hidden ProgressBar states', () => {
    const bar = disposables.add(new ProgressBar(dom.container as unknown as HTMLElement))
    bar.setProgress(45)
    expect(bar.element.classList.contains('discrete')).toBe(true)
    expect(bar.element.getAttribute('aria-valuenow')).toBe('45')

    bar.setIndeterminate(true)
    expect(bar.element.classList.contains('infinite')).toBe(true)
    bar.setIndeterminate(false)
    expect(bar.element.classList.contains('active')).toBe(false)

    bar.setProgress(null)
    expect(bar.element.getAttribute('aria-hidden')).toBe('true')
  })

  it('supports SegmentedControl clicks, arrow navigation, dynamic options, and disabled state', () => {
    const changes: string[] = []
    const control = disposables.add(
      new SegmentedControl<'a' | 'b' | 'c'>(dom.container as unknown as HTMLElement, {
        options: [
          { value: 'a', label: 'Alpha', icon: 'sun' },
          { value: 'b', label: 'Beta', icon: 'moon' },
          { value: 'c', label: 'Gamma' },
        ],
        value: 'a',
        ariaLabel: 'Mode',
      }),
    )
    disposables.add(control.onDidChange((value) => changes.push(value)))

    const buttons = control.element.querySelectorAll('button') as unknown as FakeElement[]
    const btn1 = must(buttons[1])
    const btn2 = must(buttons[2])
    dom.dispatch(btn1, 'click')
    expect(control.value).toBe('b')
    dom.dispatch(btn1, 'keydown', { key: 'ArrowRight' })
    expect(control.value).toBe('c')
    dom.dispatch(btn2, 'keydown', { key: 'ArrowLeft' })
    expect(control.value).toBe('b')

    control.value = 'a'
    control.setDisabled(true)
    dom.dispatch(btn1, 'click')
    expect(control.value).toBe('a')
    control.setOptions(
      [
        { value: 'a', label: 'A2' },
        { value: 'b', label: 'B2' },
      ],
      'b',
    )
    expect(control.value).toBe('b')
    expect(changes).toEqual(['b', 'c', 'b'])
  })

  it('supports SelectBox dropdown opening, keyboard navigation, selection, and dismissal', () => {
    const changes: string[] = []
    const select = disposables.add(
      new SelectBox<'en' | 'tr' | 'de'>(dom.container as unknown as HTMLElement, {
        options: [
          { value: 'en', label: 'English' },
          { value: 'tr', label: 'Türkçe' },
          { value: 'de', label: 'Deutsch' },
        ],
        value: 'en',
        ariaLabel: 'Language',
      }),
    )
    disposables.add(select.onDidChange((value) => changes.push(value)))

    dom.dispatch(select.element as unknown as FakeElement, 'click')
    expect(dom.document.body.querySelector('.monaco-select-box-dropdown')).not.toBeNull()

    dom.dispatch(select.element as unknown as FakeElement, 'keydown', { key: 'ArrowDown' })
    dom.dispatch(select.element as unknown as FakeElement, 'keydown', { key: 'End' })
    dom.dispatch(select.element as unknown as FakeElement, 'keydown', { key: 'Home' })
    dom.dispatch(select.element as unknown as FakeElement, 'keydown', { key: 'ArrowDown' })
    dom.dispatch(select.element as unknown as FakeElement, 'keydown', { key: 'Enter' })
    expect(select.value).toBe('tr')
    expect(changes).toEqual(['tr'])

    dom.dispatch(select.element as unknown as FakeElement, 'keydown', { key: 'ArrowDown' })
    const optionEls = dom.document.body.querySelectorAll('.monaco-select-box-option')
    const opt2 = must(optionEls[2])
    dom.dispatch(opt2, 'mouseenter')
    dom.dispatch(opt2, 'mousedown')
    dom.dispatch(opt2, 'click')
    expect(select.value).toBe('de')

    dom.dispatch(select.element as unknown as FakeElement, 'click')
    dom.dispatch(select.element as unknown as FakeElement, 'keydown', { key: 'Escape' })
    expect(dom.document.body.querySelector('.monaco-select-box-dropdown')).toBeNull()

    dom.dispatch(select.element as unknown as FakeElement, 'click')
    dom.dispatch(dom.document.body, 'pointerdown')
    expect(dom.document.body.querySelector('.monaco-select-box-dropdown')).toBeNull()

    select.value = 'en'
    select.setOptions([{ value: 'en', label: 'EN' }], 'en')
    select.setDisabled(true)
    dom.dispatch(select.element as unknown as FakeElement, 'click')
    expect(dom.document.body.querySelector('.monaco-select-box-dropdown')).toBeNull()
  })

  it('handles Slider input, change, snapping, formatting, and disabled state', () => {
    const inputs: number[] = []
    const changes: number[] = []
    const slider = disposables.add(
      new Slider(dom.container as unknown as HTMLElement, {
        min: 10,
        max: 100,
        step: 10,
        value: 50,
        ariaLabel: 'Opacity',
        formatValue: (v) => `${v}%`,
      }),
    )
    disposables.add(slider.onDidInput((v) => inputs.push(v)))
    disposables.add(slider.onDidChange((v) => changes.push(v)))

    const input = slider.element.querySelector('input') as unknown as FakeElement
    input.value = '74'
    dom.dispatch(input, 'input')
    input.value = '86'
    dom.dispatch(input, 'change')
    expect(inputs).toEqual([70])
    expect(changes).toEqual([90])
    expect(slider.value).toBe(90)

    slider.value = 30
    expect(slider.value).toBe(30)
    slider.setDisabled(true)
    expect(slider.element.classList.contains('disabled')).toBe(true)
  })

  it('supports vertical and horizontal Sash pointer dragging and keyboard stepping', () => {
    const deltas: number[] = []
    const keySteps: number[] = []
    let started = 0
    let ended = 0

    const verticalSash = disposables.add(
      new Sash(dom.container as unknown as HTMLElement, {
        orientation: 'vertical',
        ariaLabel: 'Resize sidebar',
      }),
    )
    disposables.add(verticalSash.onDidStart(() => (started += 1)))
    disposables.add(verticalSash.onDidChange((delta) => deltas.push(delta)))
    disposables.add(verticalSash.onDidEnd(() => (ended += 1)))
    disposables.add(verticalSash.onDidKeyStep((step) => keySteps.push(step)))

    verticalSash.setAriaValueNow(220)
    dom.dispatch(verticalSash.element as unknown as FakeElement, 'pointerdown', {
      button: 0,
      clientX: 200,
      pointerId: 3,
    })
    dom.dispatch(dom.window, 'pointermove', { clientX: 245 })
    dom.dispatch(dom.window, 'pointerup')
    dom.dispatch(verticalSash.element as unknown as FakeElement, 'keydown', { key: 'ArrowRight' })
    dom.dispatch(verticalSash.element as unknown as FakeElement, 'keydown', { key: 'ArrowLeft' })

    expect(started).toBe(1)
    expect(deltas).toEqual([45])
    expect(ended).toBe(1)
    expect(keySteps).toEqual([16, -16])

    const horizontalDeltas: number[] = []
    const horizontalSteps: number[] = []
    const horizontalSash = disposables.add(
      new Sash(dom.container as unknown as HTMLElement, {
        orientation: 'horizontal',
        ariaLabel: 'Resize tertiary bar',
      }),
    )
    disposables.add(horizontalSash.onDidChange((delta) => horizontalDeltas.push(delta)))
    disposables.add(horizontalSash.onDidKeyStep((step) => horizontalSteps.push(step)))

    dom.dispatch(horizontalSash.element as unknown as FakeElement, 'pointerdown', {
      button: 0,
      clientY: 500,
      pointerId: 4,
    })
    dom.dispatch(dom.window, 'pointermove', { clientY: 460 })
    dom.dispatch(dom.window, 'pointercancel')
    dom.dispatch(horizontalSash.element as unknown as FakeElement, 'keydown', { key: 'ArrowUp' })
    dom.dispatch(horizontalSash.element as unknown as FakeElement, 'keydown', { key: 'ArrowDown' })
    horizontalSash.setEnabled(false)
    dom.dispatch(horizontalSash.element as unknown as FakeElement, 'keydown', { key: 'ArrowUp' })

    expect(horizontalDeltas).toEqual([-40])
    expect(horizontalSteps).toEqual([-16, 16])
  })

  it('passes anchor element on ActionBar clicks, updates items, and navigates with arrow keys', () => {
    let clickedAnchor: HTMLElement | undefined
    const bar = disposables.add(
      new ActionBar(dom.container as unknown as HTMLElement, { orientation: 'horizontal' }),
    )
    bar.setItems([
      {
        id: 'first',
        icon: 'add',
        title: 'Add',
        active: true,
        run: (anchor) => {
          clickedAnchor = anchor
        },
      },
      {
        id: 'second',
        icon: 'trash',
        title: 'Delete',
        danger: true,
        disabled: true,
        run: () => undefined,
      },
      {
        id: 'third',
        icon: 'arrow-swap',
        title: 'Move',
        run: () => undefined,
      },
    ])

    const buttons = bar.element.querySelectorAll('button') as unknown as FakeElement[]
    const btn0 = must(buttons[0])
    const btn2 = must(buttons[2])
    dom.dispatch(btn0, 'click')
    expect(clickedAnchor).toBe(btn0 as unknown as HTMLElement)

    dom.dispatch(btn0, 'keydown', { key: 'ArrowRight' })
    expect(dom.document.activeElement).toBe(btn2)
    dom.dispatch(btn2, 'keydown', { key: 'ArrowLeft' })
    expect(dom.document.activeElement).toBe(btn0)

    bar.updateItem('second', { disabled: false, active: false })
    expect(buttons[1]?.disabled).toBe(false)
  })

  it('shows ContextMenu, supports keyboard navigation, runs actions, and dismisses cleanly', () => {
    const ran: string[] = []
    const menu = disposables.add(
      showContextMenu({ x: 1200, y: 780 }, [
        { id: 'one', label: 'Primary', icon: 'layout-sidebar-left', run: () => ran.push('one') },
        { type: 'separator' },
        { id: 'disabled', label: 'Disabled', disabled: true, run: () => ran.push('disabled') },
        { id: 'two', label: 'Tertiary', icon: 'panel-bottom', run: () => ran.push('two') },
      ]),
    )

    const menuEl = dom.document.body.querySelector('.monaco-menu') as unknown as FakeElement
    expect(menuEl).not.toBeNull()
    dom.dispatch(menuEl, 'keydown', { key: 'ArrowDown' })
    dom.dispatch(menuEl, 'keydown', { key: 'ArrowDown' })
    dom.dispatch(menuEl, 'keydown', { key: 'Enter' })
    expect(ran).toEqual(['two'])
    expect(dom.document.body.querySelector('.monaco-menu')).toBeNull()
    menu.dispose()

    const menu2 = disposables.add(
      showContextMenu({ x: 10, y: 10 }, [
        { id: 'a', label: 'A', run: () => ran.push('a') },
        { id: 'b', label: 'B', run: () => ran.push('b') },
      ]),
    )
    const menuEl2 = dom.document.body.querySelector('.monaco-menu') as unknown as FakeElement
    dom.dispatch(menuEl2, 'keydown', { key: 'End' })
    dom.dispatch(menuEl2, 'keydown', { key: 'Home' })
    dom.dispatch(menuEl2, 'keydown', { key: 'Escape' })
    expect(dom.document.body.querySelector('.monaco-menu')).toBeNull()
    menu2.dispose()
  })

  it('resolves ConfirmDialog and PromptDialog via buttons, validation, backdrop, and keyboard', async () => {
    const confirmPromise = showConfirmDialog({
      title: 'Delete all?',
      detail: 'Cannot be undone',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      danger: true,
    })
    const confirmDialog = dom.document.body.querySelector(
      '.monaco-dialog-box',
    ) as unknown as FakeElement
    dom.dispatch(confirmDialog, 'keydown', { key: 'Tab' })
    dom.dispatch(confirmDialog, 'keydown', { key: 'Tab', shiftKey: true })
    const buttons = dom.document.body.querySelectorAll('.monaco-text-button')
    dom.dispatch(must(buttons[1]), 'click')
    expect(await confirmPromise).toBe(true)

    const cancelPromise = showConfirmDialog({
      title: 'Confirm',
      confirmLabel: 'OK',
      cancelLabel: 'Cancel',
    })
    const backdrop = dom.document.body.querySelector(
      '.monaco-dialog-modal-block',
    ) as unknown as FakeElement
    dom.dispatch(backdrop, 'mousedown')
    expect(await cancelPromise).toBe(false)

    const promptPromise = showPromptDialog({
      title: 'Rename',
      initialValue: '  ',
      placeholder: 'Session name',
      confirmLabel: 'Save',
      cancelLabel: 'Cancel',
      validate: (v) => v.trim().length > 0,
    })
    const promptInput = dom.document.body.querySelector(
      '.monaco-inputbox-input',
    ) as unknown as FakeElement
    dom.dispatch(promptInput, 'keydown', { key: 'Enter' })
    promptInput.value = 'Renamed Session'
    dom.dispatch(promptInput, 'input')
    dom.dispatch(promptInput, 'keydown', { key: 'Enter' })
    expect(await promptPromise).toBe('Renamed Session')

    const escapedPrompt = showPromptDialog({
      title: 'Rename',
      confirmLabel: 'Save',
      cancelLabel: 'Cancel',
    })
    const promptBox = dom.document.body.querySelector(
      '.monaco-dialog-box',
    ) as unknown as FakeElement
    dom.dispatch(promptBox, 'keydown', { key: 'Escape' })
    expect(await escapedPrompt).toBeNull()
  })

  it('shows and hides tooltips on hover, focus-visible, and dismissal triggers', () => {
    vi.useFakeTimers()
    const target = dom.document.createElement('button')
    dom.container.appendChild(target)
    disposables.add(attachTooltip(target as unknown as HTMLElement, 'Helpful hint'))

    dom.dispatch(target, 'mouseenter')
    vi.advanceTimersByTime(400)
    const tip = dom.document.body.querySelector('.monaco-tooltip')
    expect(tip?.classList.contains('visible')).toBe(true)
    expect(tip?.textContent).toBe('Helpful hint')

    dom.dispatch(dom.document, 'keydown', { key: 'Escape' })
    expect(tip?.classList.contains('visible')).toBe(false)

    target.focusVisible = true
    dom.dispatch(target, 'focus')
    vi.advanceTimersByTime(400)
    expect(tip?.classList.contains('visible')).toBe(true)
    dom.dispatch(target, 'mouseleave')
    expect(tip?.classList.contains('visible')).toBe(false)
  })
})
