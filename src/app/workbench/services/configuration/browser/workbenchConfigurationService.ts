import { Sequencer } from '@app/base/common/async'
import { Emitter, type Event } from '@app/base/common/event'
import { Disposable } from '@app/base/common/lifecycle'
import {
  type DesktopPlatform,
  getCurrentPlatform,
  isStartupLaunchSupported,
  isTraySupported,
} from '@app/base/common/platform'
import {
  type AppConfiguration,
  type AppConfigurationPatch,
  DEFAULT_CONFIGURATION,
  type IConfigurationChangeEvent,
  type IConfigurationService,
} from '@app/platform/configuration/common/configuration'
import {
  CONFIGURATION_CHANNEL_NAME,
  ConfigurationChannelClient,
} from '@app/platform/configuration/common/configurationIpc'
import { parsePersistedConfiguration } from '@app/platform/configuration/common/configurationSchema'
import { InstantiationType, registerSingleton } from '@app/platform/instantiation/common/extensions'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'
import { getLocaleResource } from '@app/platform/localization/common/locales'
import { ILogService } from '@app/platform/log/common/log'
import { INativeHostService } from '@app/platform/native/common/native'
import { IMainProcessService } from '@app/workbench/services/ipc/electron-browser/mainProcessService'
import { INotificationService } from '@app/workbench/services/notification/browser/notificationService'

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

export interface IWorkbenchConfigurationService extends IConfigurationService {
  readonly platform: DesktopPlatform
  readonly version: string
  readonly startupHardwareAcceleration: boolean
  initialize(): Promise<AppConfiguration>
  isTrayUnavailable(): boolean
  isStartupLaunchUnavailable(): boolean
  isHardwareAccelerationRestartRequired(): boolean
  isWindowHiddenFromShell(): boolean
  exportConfiguration(): Promise<boolean>
  importConfiguration(): Promise<boolean>
  importConfiguration(input: unknown): Promise<AppConfiguration>
}

export const IWorkbenchConfigurationService = createDecorator<IWorkbenchConfigurationService>(
  'workbenchConfigurationService',
)

export class WorkbenchConfigurationService
  extends Disposable
  implements IWorkbenchConfigurationService
{
  declare readonly _serviceBrand: undefined

  private readonly _onDidChangeConfiguration = this._register(
    new Emitter<IConfigurationChangeEvent>(),
  )
  readonly onDidChangeConfiguration: Event<IConfigurationChangeEvent> =
    this._onDidChangeConfiguration.event

  private readonly channelClient: ConfigurationChannelClient
  private readonly sequencer = new Sequencer()
  private _configuration: AppConfiguration = { ...DEFAULT_CONFIGURATION }
  private _platform: DesktopPlatform = getCurrentPlatform()
  private _version = '0.0.0'
  private _startupHardwareAcceleration: boolean = DEFAULT_CONFIGURATION.hardwareAcceleration
  private hasCapturedStartupHardwareAcceleration = false
  private pendingPatch: AppConfigurationPatch | null = null
  private pendingFlushPromise: Promise<AppConfiguration> | null = null

  constructor(
    @IMainProcessService mainProcessService: IMainProcessService,
    @INativeHostService private readonly nativeHostService: INativeHostService,
    @ILogService private readonly logService: ILogService,
    @INotificationService private readonly notificationService: INotificationService,
  ) {
    super()
    this.channelClient = new ConfigurationChannelClient(
      mainProcessService.getChannel(CONFIGURATION_CHANNEL_NAME),
    )
    this._register(
      this.channelClient.onDidChangeConfiguration((configuration) => {
        this.applyConfiguration(configuration)
      }),
    )
  }

  get platform(): DesktopPlatform {
    return this._platform
  }

  get version(): string {
    return this._version
  }

  get startupHardwareAcceleration(): boolean {
    return this._startupHardwareAcceleration
  }

  async initialize(): Promise<AppConfiguration> {
    const [configuration, platform, version] = await Promise.all([
      this.channelClient.getConfiguration(),
      this.nativeHostService.getPlatform(),
      this.nativeHostService.getVersion(),
    ])
    this._platform = platform
    this._version = version
    if (!this.hasCapturedStartupHardwareAcceleration) {
      this._startupHardwareAcceleration = configuration.hardwareAcceleration
      this.hasCapturedStartupHardwareAcceleration = true
    }
    return this.applyConfiguration(configuration)
  }

  getConfiguration(): AppConfiguration {
    return { ...this._configuration }
  }

  getValue<K extends keyof AppConfiguration>(key: K): AppConfiguration[K] {
    return this._configuration[key]
  }

  updateConfiguration(patch: AppConfigurationPatch): Promise<AppConfiguration> {
    const cleaned = stripUndefinedEntries(patch)
    if (Object.keys(cleaned).length === 0) {
      return Promise.resolve(this.getConfiguration())
    }
    this.pendingPatch = this.pendingPatch ? { ...this.pendingPatch, ...cleaned } : cleaned
    if (this.pendingFlushPromise) {
      return this.pendingFlushPromise
    }

    const flushPromise = this.sequencer.queue(async () => {
      this.pendingFlushPromise = null
      const patchToPersist = this.pendingPatch
      this.pendingPatch = null
      if (!patchToPersist || Object.keys(patchToPersist).length === 0) {
        return this.getConfiguration()
      }
      try {
        const saved = await this.channelClient.updateConfiguration(patchToPersist)
        return this.applyConfiguration(saved)
      } catch (error) {
        this.reportFailure('Settings could not be saved.', error)
        throw error
      }
    })
    this.pendingFlushPromise = flushPromise
    return flushPromise
  }

  resetConfiguration(): Promise<AppConfiguration> {
    this.pendingPatch = null
    this.pendingFlushPromise = null
    return this.sequencer.queue(async () => {
      try {
        const saved = await this.channelClient.resetConfiguration()
        return this.applyConfiguration(saved)
      } catch (error) {
        this.reportFailure('Settings could not be reset.', error)
        throw error
      }
    })
  }

  isTrayUnavailable(): boolean {
    return !isTraySupported(this._platform)
  }

  isStartupLaunchUnavailable(): boolean {
    return !isStartupLaunchSupported(this._platform)
  }

  isHardwareAccelerationRestartRequired(): boolean {
    return this._configuration.hardwareAcceleration !== this._startupHardwareAcceleration
  }

  isWindowHiddenFromShell(): boolean {
    return (
      isTraySupported(this._platform) &&
      !this._configuration.showTaskbar &&
      !this._configuration.showTrayIcon
    )
  }

  async exportConfiguration(): Promise<boolean> {
    try {
      const result = await this.nativeHostService.exportConfiguration()
      return result.status === 'completed'
    } catch (error) {
      this.reportFailure('Settings could not be exported.', error)
      return false
    }
  }

  importConfiguration(): Promise<boolean>
  importConfiguration(input: unknown): Promise<AppConfiguration>
  async importConfiguration(...args: [] | [unknown]): Promise<boolean | AppConfiguration> {
    if (args.length > 0) {
      const [input] = args
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('Imported settings file must contain a JSON object.')
      }
      const parsed = parsePersistedConfiguration(input)
      const { settingsRevision: _revision, ...patch } = parsed
      return this.updateConfiguration(patch)
    }

    try {
      const result = await this.nativeHostService.importConfiguration()
      if (result.status !== 'completed' || !result.configuration) {
        return false
      }
      this.applyConfiguration(result.configuration)
      return true
    } catch (error) {
      this.reportFailure('Settings could not be imported.', error)
      return false
    }
  }

  private applyConfiguration(next: AppConfiguration): AppConfiguration {
    const previous = this._configuration
    const snapshot: AppConfiguration = { ...next }
    this._configuration = snapshot
    this.logService.setLevel(snapshot.logLevel)

    const changedKeys = diffConfigurationKeys(previous, snapshot)
    if (changedKeys.size > 0) {
      this._onDidChangeConfiguration.fire({
        configuration: { ...snapshot },
        changedKeys,
        affectsConfiguration: (key: keyof AppConfiguration): boolean => changedKeys.has(key),
      })
    }

    return { ...snapshot }
  }

  private reportFailure(message: string, error: unknown): void {
    this.logService.error('WorkbenchConfigurationService', message, error)
    const fallbackError = getLocaleResource(this._configuration.uiLanguage).errors.generic
    this.notificationService.error(fallbackError)
  }
}

registerSingleton(
  IWorkbenchConfigurationService,
  WorkbenchConfigurationService,
  InstantiationType.Eager,
)
