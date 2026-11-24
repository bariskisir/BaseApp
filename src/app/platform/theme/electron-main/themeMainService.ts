import { Emitter, type Event } from '@app/base/common/event'
import { Disposable, toDisposable } from '@app/base/common/lifecycle'
import type { ResolvedThemeMode, ThemeMode } from '@app/platform/configuration/common/configuration'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'
import { nativeTheme } from 'electron'
import type { IColorScheme } from '../common/theme'

export interface IThemeMainService {
  readonly _serviceBrand: undefined
  readonly onDidChangeColorScheme: Event<IColorScheme>
  getColorScheme(): IColorScheme
  setThemeSource(theme: ThemeMode): void
  getInitialBackgroundColor(theme: ThemeMode): string
}

export const IThemeMainService = createDecorator<IThemeMainService>('themeMainService')

const DARK_BACKGROUND_COLOR = '#1f1f1f'
const LIGHT_BACKGROUND_COLOR = '#ffffff'

export class ThemeMainService extends Disposable implements IThemeMainService {
  declare readonly _serviceBrand: undefined

  private readonly _onDidChangeColorScheme = this._register(new Emitter<IColorScheme>())
  readonly onDidChangeColorScheme: Event<IColorScheme> = this._onDidChangeColorScheme.event
  private currentColorScheme: IColorScheme

  constructor() {
    super()
    this.currentColorScheme = this.readColorScheme()
    const handleUpdated = (): void => {
      this.emitColorSchemeIfChanged()
    }
    nativeTheme.on('updated', handleUpdated)
    this._register(
      toDisposable(() => {
        nativeTheme.removeListener('updated', handleUpdated)
      }),
    )
  }

  getColorScheme(): IColorScheme {
    this.currentColorScheme = this.readColorScheme()
    return this.currentColorScheme
  }

  setThemeSource(theme: ThemeMode): void {
    nativeTheme.themeSource = theme
    this.emitColorSchemeIfChanged()
  }

  getInitialBackgroundColor(theme: ThemeMode): string {
    const resolved: ResolvedThemeMode =
      theme !== 'system' ? theme : nativeTheme.shouldUseDarkColors === false ? 'light' : 'dark'
    return resolved === 'dark' ? DARK_BACKGROUND_COLOR : LIGHT_BACKGROUND_COLOR
  }

  private readColorScheme(): IColorScheme {
    return { dark: Boolean(nativeTheme.shouldUseDarkColors) }
  }

  private emitColorSchemeIfChanged(): void {
    const next = this.readColorScheme()
    if (next.dark === this.currentColorScheme.dark) {
      return
    }
    this.currentColorScheme = next
    this._onDidChangeColorScheme.fire(next)
  }
}
