import { createStyleSheet, setStyleSheetText } from '@app/base/browser/domStylesheets'
import type { Color } from '@app/base/common/color'
import { Emitter, type Event } from '@app/base/common/event'
import { Disposable, toDisposable } from '@app/base/common/lifecycle'
import type { ResolvedThemeMode, ThemeMode } from '@app/platform/configuration/common/configuration'
import { InstantiationType, registerSingleton } from '@app/platform/instantiation/common/extensions'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'
import { ILogService } from '@app/platform/log/common/log'
import {
  type ColorIdentifier,
  type IColorRegistry,
  asCssVariableName,
  getColorRegistry,
} from '@app/platform/theme/common/colorRegistry'
import {
  asSizeCssVariableName,
  getSizeRegistry,
  sizeValueToCss,
} from '@app/platform/theme/common/sizeRegistry'
import { ColorScheme, type IColorScheme } from '@app/platform/theme/common/theme'
import { THEME_CHANNEL_NAME, ThemeChannelClient } from '@app/platform/theme/common/themeIpc'
import {
  type IColorTheme,
  type ICssStyleCollector,
  type IThemeService,
  getThemingRegistry,
} from '@app/platform/theme/common/themeService'
import '@app/workbench/common/theme'
import { IWorkbenchConfigurationService } from '@app/workbench/services/configuration/browser/workbenchConfigurationService'
import { IMainProcessService } from '@app/workbench/services/ipc/electron-browser/mainProcessService'

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'
const THEME_STYLE_CLASS_NAME = 'baseapp-theme-rules'

export interface IWorkbenchThemeService extends IThemeService {
  readonly resolvedTheme: ResolvedThemeMode
  readonly colorScheme: IColorScheme
  initialize(): Promise<void>
  generateCssRules(theme?: IColorTheme): string
}

export const IWorkbenchThemeService =
  createDecorator<IWorkbenchThemeService>('workbenchThemeService')

function detectBrowserDarkScheme(): boolean {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia(DARK_SCHEME_QUERY).matches
  }
  return true
}

function resolveThemeMode(configured: ThemeMode, scheme: IColorScheme): ResolvedThemeMode {
  if (configured === 'system') {
    return scheme.dark ? 'dark' : 'light'
  }
  return configured
}

export class ColorThemeData implements IColorTheme {
  readonly type: ColorScheme
  readonly label: string
  private readonly resolvedColors = new Map<ColorIdentifier, Color>()

  constructor(
    mode: ResolvedThemeMode,
    private readonly colorRegistry: IColorRegistry = getColorRegistry(),
  ) {
    this.type = mode === 'dark' ? ColorScheme.Dark : ColorScheme.Light
    this.label = mode === 'dark' ? 'Dark' : 'Light'
  }

  getColor(color: ColorIdentifier, useDefault = true): Color | undefined {
    const cached = this.resolvedColors.get(color)
    if (cached !== undefined) {
      return cached
    }
    if (!useDefault) {
      return undefined
    }
    const resolved = this.colorRegistry.resolveDefaultColor(color, this)
    if (resolved !== undefined) {
      this.resolvedColors.set(color, resolved)
    }
    return resolved
  }

  defines(color: ColorIdentifier): boolean {
    return this.getColor(color, true) !== undefined
  }
}

export class WorkbenchThemeService extends Disposable implements IWorkbenchThemeService {
  declare readonly _serviceBrand: undefined

  private readonly _onDidColorThemeChange = this._register(new Emitter<IColorTheme>())
  readonly onDidColorThemeChange: Event<IColorTheme> = this._onDidColorThemeChange.event

  private readonly channelClient: ThemeChannelClient
  private _colorScheme: IColorScheme
  private _resolvedTheme: ResolvedThemeMode
  private _colorTheme: IColorTheme
  private styleElement: HTMLStyleElement | null = null

  constructor(
    @IMainProcessService mainProcessService: IMainProcessService,
    @IWorkbenchConfigurationService
    private readonly configurationService: IWorkbenchConfigurationService,
    @ILogService private readonly logService: ILogService,
  ) {
    super()
    this.channelClient = new ThemeChannelClient(mainProcessService.getChannel(THEME_CHANNEL_NAME))
    this._colorScheme = { dark: detectBrowserDarkScheme() }
    this._resolvedTheme = resolveThemeMode(
      this.configurationService.getValue('theme'),
      this._colorScheme,
    )
    this._colorTheme = new ColorThemeData(this._resolvedTheme)

    this._register(
      toDisposable(() => {
        if (this.styleElement) {
          this.styleElement.remove()
          this.styleElement = null
        }
      }),
    )

    this._register(
      this.configurationService.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('theme')) {
          this.updateActiveTheme(false)
        }
      }),
    )

    this._register(
      this.channelClient.onDidChangeColorScheme((scheme) => {
        this._colorScheme = scheme
        this.updateActiveTheme(false)
      }),
    )

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const media = window.matchMedia(DARK_SCHEME_QUERY)
      const handleMediaChange = (event: MediaQueryListEvent): void => {
        this._colorScheme = { dark: event.matches }
        this.updateActiveTheme(false)
      }
      media.addEventListener('change', handleMediaChange)
      this._register(
        toDisposable(() => {
          media.removeEventListener('change', handleMediaChange)
        }),
      )
    }

    this._register(
      getColorRegistry().onDidChangeSchema(() => {
        this.refreshCurrentThemeRules()
      }),
    )

    this._register(
      getSizeRegistry().onDidChangeSchema(() => {
        this.refreshCurrentThemeRules()
      }),
    )

    this._register(
      getThemingRegistry().onThemingParticipantAdded(() => {
        this.refreshCurrentThemeRules()
      }),
    )
  }

  get resolvedTheme(): ResolvedThemeMode {
    return this._resolvedTheme
  }

  get colorScheme(): IColorScheme {
    return this._colorScheme
  }

  getColorTheme(): IColorTheme {
    return this._colorTheme
  }

  async initialize(): Promise<void> {
    try {
      this._colorScheme = await this.channelClient.getColorScheme()
    } catch (error) {
      this.logService.warn(
        'WorkbenchThemeService',
        'Operating-system color scheme could not be loaded.',
        error,
      )
    }
    this.updateActiveTheme(true)
  }

  generateCssRules(theme: IColorTheme = this._colorTheme): string {
    const declarations: string[] = []
    const colorRegistry = getColorRegistry()
    for (const contribution of colorRegistry.getColors()) {
      const color = theme.getColor(contribution.id)
      if (color) {
        declarations.push(`  ${asCssVariableName(contribution.id)}: ${color.toString()};`)
      }
    }

    const sizeRegistry = getSizeRegistry()
    for (const contribution of sizeRegistry.getSizes()) {
      const sizeValue = sizeRegistry.resolveDefaultSize(contribution.id, theme)
      if (sizeValue) {
        declarations.push(
          `  ${asSizeCssVariableName(contribution.id)}: ${sizeValueToCss(sizeValue)};`,
        )
      }
    }

    const rules: string[] = [`:root {\n${declarations.join('\n')}\n}`]
    const collector: ICssStyleCollector = {
      addRule: (rule: string): void => {
        if (rule.trim().length > 0) {
          rules.push(rule)
        }
      },
    }

    for (const participant of getThemingRegistry().getThemingParticipants()) {
      try {
        participant(theme, collector)
      } catch (error) {
        this.logService.error('WorkbenchThemeService', 'Theming participant failed.', error)
      }
    }

    return rules.join('\n')
  }

  private updateActiveTheme(forceSync: boolean): void {
    if (this.isDisposed) {
      return
    }
    const nextResolved = resolveThemeMode(
      this.configurationService.getValue('theme'),
      this._colorScheme,
    )
    const themeChanged = nextResolved !== this._resolvedTheme
    if (!themeChanged && !forceSync) {
      return
    }

    this._resolvedTheme = nextResolved
    this._colorTheme = new ColorThemeData(nextResolved)
    this.applyDomTheme()
    this.syncTitleBarTheme(nextResolved)

    if (themeChanged) {
      this._onDidColorThemeChange.fire(this._colorTheme)
    }
  }

  private refreshCurrentThemeRules(): void {
    if (this.isDisposed) {
      return
    }
    this._colorTheme = new ColorThemeData(this._resolvedTheme)
    this.applyDomTheme()
  }

  private applyDomTheme(): void {
    if (typeof document === 'undefined') {
      return
    }
    if (document.head) {
      if (!this.styleElement?.isConnected) {
        this.styleElement = createStyleSheet(document.head, THEME_STYLE_CLASS_NAME)
      }
      setStyleSheetText(this.styleElement, this.generateCssRules(this._colorTheme))
    }
    if (document.body) {
      document.body.setAttribute('theme-mode', this._resolvedTheme)
    }
    if (document.documentElement) {
      document.documentElement.style.colorScheme = this._resolvedTheme
    }
  }

  private syncTitleBarTheme(theme: ResolvedThemeMode): void {
    void this.channelClient.setTitleBarTheme(theme).catch((error: unknown) => {
      this.logService.warn(
        'WorkbenchThemeService',
        'Native title-bar theme could not be synchronized.',
        error,
      )
    })
  }
}

registerSingleton(IWorkbenchThemeService, WorkbenchThemeService, InstantiationType.Eager)
