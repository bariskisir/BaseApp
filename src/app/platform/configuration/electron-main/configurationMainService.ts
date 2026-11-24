import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Emitter, type Event } from '@app/base/common/event'
import { Disposable } from '@app/base/common/lifecycle'
import type { DesktopPlatform } from '@app/base/common/platform'
import {
  readJsonFile,
  removeInterruptedWrites,
  writeJsonFileAtomic,
} from '@app/base/node/atomicFile'
import { FileOperationQueue } from '@app/base/node/fileOperationQueue'
import {
  type AppConfiguration,
  type AppConfigurationPatch,
  DEFAULT_CONFIGURATION,
  type IConfigurationChangeEvent,
  type IConfigurationService,
} from '../common/configuration'
import {
  configurationSchema,
  filterConfigurationPatchForPlatform,
  normalizeConfigurationForPlatform,
  parsePersistedConfiguration,
} from '../common/configurationSchema'

const CONFIGURATION_KEYS = Object.keys(DEFAULT_CONFIGURATION) as readonly (keyof AppConfiguration)[]

function stripUndefinedEntries(patch: AppConfigurationPatch): AppConfigurationPatch {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      result[key] = value
    }
  }
  return result as AppConfigurationPatch
}

function diffConfigurationKeys(
  previous: AppConfiguration,
  next: AppConfiguration,
): ReadonlySet<keyof AppConfiguration> {
  const changed = new Set<keyof AppConfiguration>()
  for (const key of CONFIGURATION_KEYS) {
    if (!Object.is(previous[key], next[key])) {
      changed.add(key)
    }
  }
  return changed
}

export class ConfigurationMainService extends Disposable implements IConfigurationService {
  declare readonly _serviceBrand: undefined

  private readonly _onDidChangeConfiguration = this._register(
    new Emitter<IConfigurationChangeEvent>(),
  )
  readonly onDidChangeConfiguration: Event<IConfigurationChangeEvent> =
    this._onDidChangeConfiguration.event

  private _effectiveConfiguration: AppConfiguration

  constructor(
    private readonly settingsPath: string,
    private readonly platform: DesktopPlatform,
    private readonly fileQueue: FileOperationQueue = new FileOperationQueue(),
  ) {
    super()
    this._effectiveConfiguration = normalizeConfigurationForPlatform(
      DEFAULT_CONFIGURATION,
      platform,
    )
  }

  async initialize(): Promise<AppConfiguration> {
    const directory = dirname(this.settingsPath)
    await mkdir(directory, { recursive: true })
    await removeInterruptedWrites(directory)
    return this.fileQueue.run(this.settingsPath, async () => {
      const persisted = await this.readPersistedUnlocked()
      this._effectiveConfiguration = normalizeConfigurationForPlatform(persisted, this.platform)
      return { ...this._effectiveConfiguration }
    })
  }

  getConfiguration(): AppConfiguration {
    return { ...this._effectiveConfiguration }
  }

  getValue<K extends keyof AppConfiguration>(key: K): AppConfiguration[K] {
    return this._effectiveConfiguration[key]
  }

  async updateConfiguration(patch: AppConfigurationPatch): Promise<AppConfiguration> {
    const filteredPatch = stripUndefinedEntries(
      filterConfigurationPatchForPlatform(patch, this.platform),
    )
    return this.fileQueue.run(this.settingsPath, async () => {
      if (Object.keys(filteredPatch).length === 0) {
        const persisted = await this.readPersistedUnlocked()
        return this.commitEffectiveConfiguration(persisted)
      }
      const currentPersisted = await this.readPersistedUnlocked()
      const nextPersisted = configurationSchema.parse({
        ...currentPersisted,
        ...filteredPatch,
      })
      await writeJsonFileAtomic(this.settingsPath, nextPersisted)
      return this.commitEffectiveConfiguration(nextPersisted)
    })
  }

  async resetConfiguration(): Promise<AppConfiguration> {
    return this.fileQueue.run(this.settingsPath, async () => {
      const nextPersisted = configurationSchema.parse(DEFAULT_CONFIGURATION)
      await writeJsonFileAtomic(this.settingsPath, nextPersisted)
      return this.commitEffectiveConfiguration(nextPersisted)
    })
  }

  async importConfiguration(input: unknown): Promise<AppConfiguration> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Imported settings file must contain a JSON object.')
    }
    return this.fileQueue.run(this.settingsPath, async () => {
      const nextPersisted = parsePersistedConfiguration(input)
      await writeJsonFileAtomic(this.settingsPath, nextPersisted)
      return this.commitEffectiveConfiguration(nextPersisted)
    })
  }

  private async readPersistedUnlocked(): Promise<AppConfiguration> {
    try {
      return parsePersistedConfiguration(await readJsonFile(this.settingsPath))
    } catch {
      return parsePersistedConfiguration(null)
    }
  }

  private commitEffectiveConfiguration(persisted: AppConfiguration): AppConfiguration {
    const previous = this._effectiveConfiguration
    const next = normalizeConfigurationForPlatform(persisted, this.platform)
    this._effectiveConfiguration = next

    const changedKeys = diffConfigurationKeys(previous, next)
    if (changedKeys.size > 0) {
      const snapshot: AppConfiguration = { ...next }
      this._onDidChangeConfiguration.fire({
        configuration: snapshot,
        changedKeys,
        affectsConfiguration: (key: keyof AppConfiguration): boolean => changedKeys.has(key),
      })
    }

    return { ...next }
  }
}
