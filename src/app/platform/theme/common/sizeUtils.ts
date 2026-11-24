import { Emitter, type Event } from '@app/base/common/event'
import { Registry } from '@app/platform/registry/common/platform'
import { ColorScheme } from './theme'
import type { IColorTheme } from './themeService'

export type SizeIdentifier = string

export type SizeUnit = 'px' | 'rem' | 'em' | '%' | 'ms' | ''

export interface SizeValue {
  readonly value: number
  readonly unit: SizeUnit
}

export interface SizeDefaults {
  readonly dark: SizeValue | SizeIdentifier | null
  readonly light: SizeValue | SizeIdentifier | null
}

export interface SizeContribution {
  readonly id: SizeIdentifier
  readonly defaults: SizeDefaults | SizeValue | SizeIdentifier | null
}

export const SizeExtensions = {
  SizeContribution: 'baseapp.contributions.sizes',
} as const

export interface ISizeRegistry {
  readonly onDidChangeSchema: Event<void>
  registerSize(
    id: SizeIdentifier,
    defaults: SizeDefaults | SizeValue | SizeIdentifier | null,
  ): SizeIdentifier
  deregisterSize(id: SizeIdentifier): void
  getSizes(): SizeContribution[]
  resolveDefaultSize(id: SizeIdentifier, theme: IColorTheme): SizeValue | undefined
}

export function size(value: number, unit: SizeUnit): SizeValue {
  return { value, unit }
}

export function sizeForAllThemes(value: number, unit: SizeUnit): SizeDefaults {
  const token = size(value, unit)
  return { dark: token, light: token }
}

export function sizeValueToCss(sizeValue: SizeValue): string {
  return `${sizeValue.value}${sizeValue.unit}`
}

export function asSizeCssVariableName(sizeIdent: SizeIdentifier): string {
  return `--baseapp-${sizeIdent.replace(/\./g, '-')}`
}

export function asSizeCssVariable(sizeIdent: SizeIdentifier): string {
  return `var(${asSizeCssVariableName(sizeIdent)})`
}

function isSizeDefaults(
  value: SizeDefaults | SizeValue | SizeIdentifier | null,
): value is SizeDefaults {
  return value !== null && typeof value === 'object' && 'dark' in value && 'light' in value
}

function isSizeValue(value: SizeValue | SizeIdentifier | null): value is SizeValue {
  return value !== null && typeof value === 'object' && 'value' in value && 'unit' in value
}

class SizeRegistry implements ISizeRegistry {
  private readonly _onDidChangeSchema = new Emitter<void>()
  readonly onDidChangeSchema: Event<void> = this._onDidChangeSchema.event
  private readonly sizesById = new Map<SizeIdentifier, SizeContribution>()
  private readonly resolvingIds = new Set<SizeIdentifier>()

  registerSize(
    id: SizeIdentifier,
    defaults: SizeDefaults | SizeValue | SizeIdentifier | null,
  ): SizeIdentifier {
    this.sizesById.set(id, { id, defaults })
    this._onDidChangeSchema.fire()
    return id
  }

  deregisterSize(id: SizeIdentifier): void {
    if (this.sizesById.delete(id)) {
      this._onDidChangeSchema.fire()
    }
  }

  getSizes(): SizeContribution[] {
    return Array.from(this.sizesById.values())
  }

  resolveDefaultSize(id: SizeIdentifier, theme: IColorTheme): SizeValue | undefined {
    const contribution = this.sizesById.get(id)
    if (!contribution || contribution.defaults === null || this.resolvingIds.has(id)) {
      return undefined
    }
    this.resolvingIds.add(id)
    try {
      const defaultValue = isSizeDefaults(contribution.defaults)
        ? theme.type === ColorScheme.Dark
          ? contribution.defaults.dark
          : contribution.defaults.light
        : contribution.defaults
      if (defaultValue === null) {
        return undefined
      }
      if (isSizeValue(defaultValue)) {
        return defaultValue
      }
      return this.resolveDefaultSize(defaultValue, theme)
    } finally {
      this.resolvingIds.delete(id)
    }
  }
}

const sizeRegistry = new SizeRegistry()
Registry.add(SizeExtensions.SizeContribution, sizeRegistry)

export function registerSize(
  id: SizeIdentifier,
  defaults: SizeDefaults | SizeValue | SizeIdentifier | null,
): SizeIdentifier {
  return sizeRegistry.registerSize(id, defaults)
}

export function getSizeRegistry(): ISizeRegistry {
  return Registry.knows(SizeExtensions.SizeContribution)
    ? Registry.as<ISizeRegistry>(SizeExtensions.SizeContribution)
    : sizeRegistry
}
