import { Color, RGBA } from '@app/base/common/color'
import { Emitter, type Event } from '@app/base/common/event'
import { Registry } from '@app/platform/registry/common/platform'
import { ColorScheme } from './theme'
import type { IColorTheme } from './themeService'

export type ColorIdentifier = string

export enum ColorTransformType {
  Darken = 0,
  Lighten = 1,
  Transparent = 2,
  Opacity = 3,
  Mix = 4,
  OneOf = 5,
}

export type ColorTransform =
  | { readonly op: ColorTransformType.Darken; readonly value: ColorValue; readonly factor: number }
  | { readonly op: ColorTransformType.Lighten; readonly value: ColorValue; readonly factor: number }
  | {
      readonly op: ColorTransformType.Transparent
      readonly value: ColorValue
      readonly factor: number
    }
  | { readonly op: ColorTransformType.Opacity; readonly value: ColorValue; readonly alpha: number }
  | {
      readonly op: ColorTransformType.Mix
      readonly color: ColorValue
      readonly with: ColorValue
      readonly ratio?: number
    }
  | { readonly op: ColorTransformType.OneOf; readonly values: readonly ColorValue[] }

export type ColorValue = Color | string | ColorIdentifier | ColorTransform

export interface ColorDefaults {
  readonly dark: ColorValue | null
  readonly light: ColorValue | null
}

export interface ColorContribution {
  readonly id: ColorIdentifier
  readonly defaults: ColorDefaults | ColorValue | null
}

export const ColorExtensions = {
  ColorContribution: 'baseapp.contributions.colors',
} as const

export interface IColorRegistry {
  readonly onDidChangeSchema: Event<void>
  registerColor(id: ColorIdentifier, defaults: ColorDefaults | ColorValue | null): ColorIdentifier
  deregisterColor(id: ColorIdentifier): void
  getColors(): ColorContribution[]
  resolveDefaultColor(id: ColorIdentifier, theme: IColorTheme): Color | undefined
}

const RGBA_PATTERN = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9]*\.?[0-9]+))?\s*\)$/i

export function asCssVariableName(colorIdent: ColorIdentifier): string {
  return `--baseapp-${colorIdent.replace(/\./g, '-')}`
}

export function asCssVariable(color: ColorIdentifier): string {
  return `var(${asCssVariableName(color)})`
}

export function asCssVariableWithDefault(color: ColorIdentifier, defaultCssValue: string): string {
  return `var(${asCssVariableName(color)}, ${defaultCssValue})`
}

export function darken(colorValue: ColorValue, factor: number): ColorTransform {
  return { op: ColorTransformType.Darken, value: colorValue, factor }
}

export function lighten(colorValue: ColorValue, factor: number): ColorTransform {
  return { op: ColorTransformType.Lighten, value: colorValue, factor }
}

export function transparent(colorValue: ColorValue, factor: number): ColorTransform {
  return { op: ColorTransformType.Transparent, value: colorValue, factor }
}

export function opacity(colorValue: ColorValue, alpha: number): ColorTransform {
  return { op: ColorTransformType.Opacity, value: colorValue, alpha }
}

export function mix(color: ColorValue, withColor: ColorValue, ratio?: number): ColorTransform {
  if (ratio !== undefined) {
    return { op: ColorTransformType.Mix, color, with: withColor, ratio }
  }
  return { op: ColorTransformType.Mix, color, with: withColor }
}

export function oneOf(...values: ColorValue[]): ColorTransform {
  return { op: ColorTransformType.OneOf, values }
}

function isColorDefaults(value: ColorDefaults | ColorValue | null): value is ColorDefaults {
  return value !== null && typeof value === 'object' && 'dark' in value && 'light' in value
}

function isColorTransform(value: ColorValue): value is ColorTransform {
  return typeof value === 'object' && value !== null && 'op' in value
}

function parseColorString(value: string): Color | undefined {
  const trimmed = value.trim()
  if (trimmed.startsWith('#')) {
    return Color.fromHex(trimmed)
  }
  const match = RGBA_PATTERN.exec(trimmed)
  if (match) {
    const r = Number(match[1])
    const g = Number(match[2])
    const b = Number(match[3])
    const a = match[4] !== undefined ? Number(match[4]) : 1
    return new Color(new RGBA(r, g, b, a))
  }
  return undefined
}

export function resolveColorValue(
  colorValue: ColorValue | null,
  theme: IColorTheme,
): Color | undefined {
  if (colorValue === null) {
    return undefined
  }
  if (colorValue instanceof Color) {
    return colorValue
  }
  if (typeof colorValue === 'string') {
    const parsed = parseColorString(colorValue)
    if (parsed) {
      return parsed
    }
    return theme.getColor(colorValue)
  }
  if (isColorTransform(colorValue)) {
    return executeTransform(colorValue, theme)
  }
  return undefined
}

function executeTransform(transform: ColorTransform, theme: IColorTheme): Color | undefined {
  switch (transform.op) {
    case ColorTransformType.Darken:
      return resolveColorValue(transform.value, theme)?.darken(transform.factor)
    case ColorTransformType.Lighten:
      return resolveColorValue(transform.value, theme)?.lighten(transform.factor)
    case ColorTransformType.Transparent:
      return resolveColorValue(transform.value, theme)?.transparent(transform.factor)
    case ColorTransformType.Opacity: {
      const resolved = resolveColorValue(transform.value, theme)
      if (!resolved) {
        return undefined
      }
      const { r, g, b } = resolved.rgba
      return new Color(new RGBA(r, g, b, transform.alpha))
    }
    case ColorTransformType.Mix: {
      const primary = resolveColorValue(transform.color, theme)
      const secondary = resolveColorValue(transform.with, theme)
      if (!primary || !secondary) {
        return undefined
      }
      return primary.mix(secondary, transform.ratio ?? 0.5)
    }
    case ColorTransformType.OneOf: {
      for (const candidate of transform.values) {
        const resolved = resolveColorValue(candidate, theme)
        if (resolved) {
          return resolved
        }
      }
      return undefined
    }
  }
}

class ColorRegistry implements IColorRegistry {
  private readonly _onDidChangeSchema = new Emitter<void>()
  readonly onDidChangeSchema: Event<void> = this._onDidChangeSchema.event
  private readonly colorsById = new Map<ColorIdentifier, ColorContribution>()
  private readonly resolvingIds = new Set<ColorIdentifier>()

  registerColor(id: ColorIdentifier, defaults: ColorDefaults | ColorValue | null): ColorIdentifier {
    this.colorsById.set(id, { id, defaults })
    this._onDidChangeSchema.fire()
    return id
  }

  deregisterColor(id: ColorIdentifier): void {
    if (this.colorsById.delete(id)) {
      this._onDidChangeSchema.fire()
    }
  }

  getColors(): ColorContribution[] {
    return Array.from(this.colorsById.values())
  }

  resolveDefaultColor(id: ColorIdentifier, theme: IColorTheme): Color | undefined {
    const contribution = this.colorsById.get(id)
    if (!contribution || contribution.defaults === null || this.resolvingIds.has(id)) {
      return undefined
    }
    this.resolvingIds.add(id)
    try {
      const defaultValue = isColorDefaults(contribution.defaults)
        ? theme.type === ColorScheme.Dark
          ? contribution.defaults.dark
          : contribution.defaults.light
        : contribution.defaults
      return resolveColorValue(defaultValue, theme)
    } finally {
      this.resolvingIds.delete(id)
    }
  }
}

const colorRegistry = new ColorRegistry()
Registry.add(ColorExtensions.ColorContribution, colorRegistry)

export function registerColor(
  id: ColorIdentifier,
  defaults: ColorDefaults | ColorValue | null,
): ColorIdentifier {
  return colorRegistry.registerColor(id, defaults)
}

export function getColorRegistry(): IColorRegistry {
  return Registry.knows(ColorExtensions.ColorContribution)
    ? Registry.as<IColorRegistry>(ColorExtensions.ColorContribution)
    : colorRegistry
}
