import type { Color } from '@app/base/common/color'
import { Emitter, type Event } from '@app/base/common/event'
import { type IDisposable, toDisposable } from '@app/base/common/lifecycle'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'
import { Registry } from '@app/platform/registry/common/platform'
import type { ColorIdentifier } from './colorUtils'
import type { ColorScheme } from './theme'

export interface IColorTheme {
  readonly type: ColorScheme
  readonly label: string
  getColor(color: ColorIdentifier, useDefault?: boolean): Color | undefined
  defines(color: ColorIdentifier): boolean
}

export interface ICssStyleCollector {
  addRule(rule: string): void
}

export type IThemingParticipant = (theme: IColorTheme, collector: ICssStyleCollector) => void

export interface IThemeService {
  readonly _serviceBrand: undefined
  getColorTheme(): IColorTheme
  readonly onDidColorThemeChange: Event<IColorTheme>
}

export const IThemeService = createDecorator<IThemeService>('themeService')

export const ThemingExtensions = {
  ThemingContribution: 'baseapp.contributions.theming',
} as const

export interface IThemingRegistry {
  readonly onThemingParticipantAdded: Event<IThemingParticipant>
  onColorThemeChange(participant: IThemingParticipant): IDisposable
  getThemingParticipants(): readonly IThemingParticipant[]
}

class ThemingRegistry implements IThemingRegistry {
  private readonly _onThemingParticipantAdded = new Emitter<IThemingParticipant>()
  readonly onThemingParticipantAdded: Event<IThemingParticipant> =
    this._onThemingParticipantAdded.event
  private readonly participants: IThemingParticipant[] = []

  onColorThemeChange(participant: IThemingParticipant): IDisposable {
    this.participants.push(participant)
    this._onThemingParticipantAdded.fire(participant)
    return toDisposable(() => {
      const index = this.participants.indexOf(participant)
      if (index !== -1) {
        this.participants.splice(index, 1)
      }
    })
  }

  getThemingParticipants(): readonly IThemingParticipant[] {
    return [...this.participants]
  }
}

const themingRegistry = new ThemingRegistry()
Registry.add(ThemingExtensions.ThemingContribution, themingRegistry)

export function registerThemingParticipant(participant: IThemingParticipant): IDisposable {
  return themingRegistry.onColorThemeChange(participant)
}

export function getThemingRegistry(): IThemingRegistry {
  return Registry.knows(ThemingExtensions.ThemingContribution)
    ? Registry.as<IThemingRegistry>(ThemingExtensions.ThemingContribution)
    : themingRegistry
}
