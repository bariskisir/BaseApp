import { Emitter, type Event } from '@app/base/common/event'
import { Disposable, type IDisposable, toDisposable } from '@app/base/common/lifecycle'
import { Registry } from '@app/platform/registry/common/platform'

export interface ISettingsCategoryDescriptor<TComponent = unknown> {
  readonly id: string
  readonly titleKey: string
  readonly iconId: string
  readonly order: number
  readonly component: () => TComponent
}

export const SettingsExtensions = {
  SettingsCategories: 'baseapp.workbench.settingsCategories',
} as const

export interface ISettingsRegistry {
  readonly onDidChangeCategories: Event<void>
  registerCategory(descriptor: ISettingsCategoryDescriptor): IDisposable
  getCategories(): readonly ISettingsCategoryDescriptor[]
  getCategory(id: string): ISettingsCategoryDescriptor | undefined
  clearForTest(): void
}

export class SettingsRegistry extends Disposable implements ISettingsRegistry {
  private readonly _onDidChangeCategories = this._register(new Emitter<void>())
  readonly onDidChangeCategories: Event<void> = this._onDidChangeCategories.event
  private readonly categories = new Map<string, ISettingsCategoryDescriptor>()

  registerCategory(descriptor: ISettingsCategoryDescriptor): IDisposable {
    if (!descriptor.id || descriptor.id.trim().length === 0) {
      throw new Error('Settings category id must be a non-empty string')
    }
    this.categories.set(descriptor.id, descriptor)
    this._onDidChangeCategories.fire()

    return toDisposable(() => {
      if (this.categories.get(descriptor.id) === descriptor) {
        this.categories.delete(descriptor.id)
        this._onDidChangeCategories.fire()
      }
    })
  }

  getCategories(): readonly ISettingsCategoryDescriptor[] {
    return Array.from(this.categories.values()).sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order
      }
      return left.id.localeCompare(right.id)
    })
  }

  getCategory(id: string): ISettingsCategoryDescriptor | undefined {
    return this.categories.get(id)
  }

  clearForTest(): void {
    if (this.categories.size === 0) {
      return
    }
    this.categories.clear()
    this._onDidChangeCategories.fire()
  }
}

const settingsRegistry = new SettingsRegistry()
Registry.add(SettingsExtensions.SettingsCategories, settingsRegistry)

export function getSettingsRegistry(): ISettingsRegistry {
  return Registry.knows(SettingsExtensions.SettingsCategories)
    ? Registry.as<ISettingsRegistry>(SettingsExtensions.SettingsCategories)
    : settingsRegistry
}

export function registerSettingsCategory(descriptor: ISettingsCategoryDescriptor): IDisposable {
  return getSettingsRegistry().registerCategory(descriptor)
}
