import { Color } from '@app/base/common/color'
import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import {
  asCssVariable,
  asCssVariableName,
  asCssVariableWithDefault,
  darken,
  getColorRegistry,
  lighten,
  mix,
  oneOf,
  opacity,
  registerColor,
  resolveColorValue,
  transparent,
} from '@app/platform/theme/common/colorRegistry'
import '@app/platform/theme/common/colors/accentColors'
import '@app/platform/theme/common/colors/baseColors'
import '@app/platform/theme/common/colors/statusColors'
import '@app/platform/theme/common/colors/surfaceColors'
import '@app/platform/theme/common/colors/widgetColors'
import {
  asSizeCssVariable,
  asSizeCssVariableName,
  getSizeRegistry,
  registerSize,
  sizeForAllThemes,
  sizeValueToCss,
} from '@app/platform/theme/common/sizeRegistry'
import '@app/platform/theme/common/sizes/baseSizes'
import '@app/platform/theme/common/sizes/layoutSizes'
import { ColorScheme } from '@app/platform/theme/common/theme'
import { ThemeChannelClient, createThemeChannel } from '@app/platform/theme/common/themeIpc'
import { getThemingRegistry } from '@app/platform/theme/common/themeService'
import { ThemeMainService } from '@app/platform/theme/electron-main/themeMainService'
import { describe, expect, it, vi } from 'vitest'

const mockNativeTheme = vi.hoisted(() => {
  const listeners = new Map<string, Set<() => void>>()
  return {
    shouldUseDarkColors: true,
    themeSource: 'system',
    on(event: string, listener: () => void) {
      let set = listeners.get(event)
      if (!set) {
        set = new Set()
        listeners.set(event, set)
      }
      set.add(listener)
    },
    removeListener(event: string, listener: () => void) {
      listeners.get(event)?.delete(listener)
    },
    emit(event: string) {
      for (const listener of [...(listeners.get(event) ?? [])]) {
        listener()
      }
    },
  }
})

vi.mock('electron', () => ({
  nativeTheme: mockNativeTheme,
}))

describe('platform theme registries, IPC, and ThemeMainService', () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite()

  it('registers and resolves colors, transparent transforms, sizes, and theming participants', () => {
    expect(asCssVariableName('sideBar.background')).toBe('--baseapp-sideBar-background')
    expect(asCssVariable('sideBar.background')).toBe('var(--baseapp-sideBar-background)')
    expect(asCssVariableWithDefault('sideBar.background', '#000')).toBe(
      'var(--baseapp-sideBar-background, #000)',
    )
    expect(asSizeCssVariableName('layout.titlebarHeight')).toBe('--baseapp-layout-titlebarHeight')
    expect(asSizeCssVariable('layout.titlebarHeight')).toBe('var(--baseapp-layout-titlebarHeight)')

    const baseId = 'test.theme.base'
    const alphaId = 'test.theme.alpha'
    const darkId = 'test.theme.darken'
    const lightId = 'test.theme.lighten'
    const opacityId = 'test.theme.opacity'
    const mixId = 'test.theme.mix'
    const oneOfId = 'test.theme.oneOf'
    const rgbaId = 'test.theme.rgba'
    const nullId = 'test.theme.null'

    registerColor(baseId, { dark: '#112233', light: '#ddeeff' })
    registerColor(alphaId, {
      dark: transparent(baseId, 0.5),
      light: transparent(baseId, 0.25),
    })
    registerColor(darkId, darken(baseId, 0.2))
    registerColor(lightId, lighten(baseId, 0.2))
    registerColor(opacityId, opacity(baseId, 0.4))
    registerColor(mixId, mix(baseId, '#ffffff', 0.5))
    registerColor(oneOfId, oneOf('test.theme.missing', baseId))
    registerColor(rgbaId, 'rgba(10, 20, 30, 0.5)')
    registerColor(nullId, null)

    const colorRegistry = getColorRegistry()
    const makeTheme = (type: ColorScheme) => {
      const theme = {
        type,
        label: type === ColorScheme.Dark ? 'Dark' : 'Light',
        getColor: (id: string) => colorRegistry.resolveDefaultColor(id, theme),
        defines: () => true,
      }
      return theme
    }
    const darkTheme = makeTheme(ColorScheme.Dark)
    const lightTheme = makeTheme(ColorScheme.Light)

    expect(colorRegistry.resolveDefaultColor(baseId, darkTheme)?.toString()).toBe('#112233')
    expect(colorRegistry.resolveDefaultColor(baseId, lightTheme)?.toString()).toBe('#ddeeff')
    expect(colorRegistry.resolveDefaultColor(alphaId, darkTheme)?.rgba.a).toBeCloseTo(0.5, 2)
    expect(colorRegistry.resolveDefaultColor(darkId, darkTheme)).toBeDefined()
    expect(colorRegistry.resolveDefaultColor(lightId, darkTheme)).toBeDefined()
    expect(colorRegistry.resolveDefaultColor(opacityId, darkTheme)?.rgba.a).toBeCloseTo(0.4, 2)
    expect(colorRegistry.resolveDefaultColor(mixId, darkTheme)).toBeDefined()
    expect(colorRegistry.resolveDefaultColor(oneOfId, darkTheme)?.toString()).toBe('#112233')
    expect(colorRegistry.resolveDefaultColor(rgbaId, darkTheme)?.rgba.r).toBe(10)
    expect(colorRegistry.resolveDefaultColor(nullId, darkTheme)).toBeUndefined()
    expect(resolveColorValue(Color.fromHex('#abcdef'), darkTheme)?.toString()).toBe('#abcdef')
    expect(resolveColorValue(mix('missing.a', 'missing.b'), darkTheme)).toBeUndefined()
    expect(resolveColorValue(opacity('missing.a', 0.5), darkTheme)).toBeUndefined()
    expect(resolveColorValue(oneOf('missing.a'), darkTheme)).toBeUndefined()
    expect(resolveColorValue(null, darkTheme)).toBeUndefined()
    colorRegistry.deregisterColor(nullId)
    expect(colorRegistry.getColors().some((item) => item.id === 'button.background')).toBe(true)

    const sizeId = 'test.size.sample'
    registerSize(sizeId, sizeForAllThemes(24, 'px'))
    const sizeRegistry = getSizeRegistry()
    expect(sizeValueToCss({ value: 24, unit: 'px' })).toBe('24px')
    expect(sizeRegistry.resolveDefaultSize(sizeId, darkTheme)).toEqual({
      value: 24,
      unit: 'px',
    })
    expect(sizeRegistry.resolveDefaultSize('layout.titlebarHeight', darkTheme)).toEqual({
      value: 35,
      unit: 'px',
    })
    expect(sizeRegistry.resolveDefaultSize('layout.activitybarWidth', darkTheme)).toBeUndefined()

    const theming = getThemingRegistry()
    const participantReg = disposables.add(
      theming.onColorThemeChange((_theme, collector) => {
        collector.addRule('.test-theme-rule { color: red; }')
      }),
    )
    expect(theming.getThemingParticipants().length).toBeGreaterThan(0)
    const rules: string[] = []
    for (const participant of theming.getThemingParticipants()) {
      participant(darkTheme, { addRule: (rule) => rules.push(rule) })
    }
    expect(rules.some((rule) => rule.includes('.test-theme-rule'))).toBe(true)
    expect(Color.fromHex('#1f1f1f').toString()).toBe('#1f1f1f')
    participantReg.dispose()
  })

  it('tracks nativeTheme updates in ThemeMainService and validates ThemeChannelClient IPC', async () => {
    mockNativeTheme.shouldUseDarkColors = true
    mockNativeTheme.themeSource = 'system'

    const themeMain = disposables.add(new ThemeMainService())
    expect(themeMain.getColorScheme()).toEqual({ dark: true })
    expect(themeMain.getInitialBackgroundColor('dark')).toBe('#1f1f1f')
    expect(themeMain.getInitialBackgroundColor('light')).toBe('#ffffff')
    expect(themeMain.getInitialBackgroundColor('system')).toBe('#1f1f1f')

    const observed: boolean[] = []
    disposables.add(themeMain.onDidChangeColorScheme((scheme) => observed.push(scheme.dark)))

    mockNativeTheme.shouldUseDarkColors = false
    mockNativeTheme.emit('updated')
    expect(observed).toEqual([false])

    themeMain.setThemeSource('dark')
    expect(mockNativeTheme.themeSource).toBe('dark')

    const titleBarThemes: string[] = []
    const serverChannel = createThemeChannel({
      getColorScheme: async () => themeMain.getColorScheme(),
      setTitleBarTheme: async (theme) => {
        titleBarThemes.push(theme)
      },
      onDidChangeColorScheme: themeMain.onDidChangeColorScheme,
    })

    const client = new ThemeChannelClient({
      call: <T>(cmd: string, arg?: unknown) => serverChannel.call<T>(1, cmd, arg),
      listen: <T>(evt: string, arg?: unknown) => serverChannel.listen<T>(1, evt, arg),
    })

    expect(await client.getColorScheme()).toEqual({ dark: false })
    await client.setTitleBarTheme('dark')
    expect(titleBarThemes).toEqual(['dark'])
    await expect(client.setTitleBarTheme('invalid' as 'dark')).rejects.toThrow()
  })
})
