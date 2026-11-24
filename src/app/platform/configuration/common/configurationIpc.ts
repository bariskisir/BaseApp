import { Event } from '@app/base/common/event'
import type { IChannel, IServerChannel } from '@app/base/parts/ipc/common/ipc'
import { ProxyChannel } from '@app/base/parts/ipc/common/proxyChannel'
import type {
  AppConfiguration,
  AppConfigurationPatch,
  IConfigurationService,
} from './configuration'
import { configurationPatchSchema } from './configurationSchema'

export const CONFIGURATION_CHANNEL_NAME = 'configuration'

export interface IConfigurationChannelService {
  getConfiguration(): Promise<AppConfiguration>
  updateConfiguration(patch: AppConfigurationPatch): Promise<AppConfiguration>
  resetConfiguration(): Promise<AppConfiguration>
  readonly onDidChangeConfiguration: Event<AppConfiguration>
}

export function createConfigurationChannel(service: IConfigurationService): IServerChannel<number> {
  const target: IConfigurationChannelService = {
    getConfiguration: async (): Promise<AppConfiguration> => service.getConfiguration(),
    updateConfiguration: (patch: AppConfigurationPatch): Promise<AppConfiguration> =>
      service.updateConfiguration(patch),
    resetConfiguration: (): Promise<AppConfiguration> => service.resetConfiguration(),
    onDidChangeConfiguration: Event.map(
      service.onDidChangeConfiguration,
      (event) => event.configuration,
    ),
  }

  return ProxyChannel.fromService(target, {
    validators: {
      updateConfiguration: (arg: unknown): AppConfigurationPatch =>
        configurationPatchSchema.parse(arg),
    },
    eventNames: ['onDidChangeConfiguration'],
  })
}

export class ConfigurationChannelClient implements IConfigurationChannelService {
  readonly onDidChangeConfiguration: Event<AppConfiguration>

  constructor(private readonly channel: IChannel) {
    this.onDidChangeConfiguration = this.channel.listen<AppConfiguration>(
      'onDidChangeConfiguration',
    )
  }

  getConfiguration(): Promise<AppConfiguration> {
    return this.channel.call<AppConfiguration>('getConfiguration')
  }

  updateConfiguration(patch: AppConfigurationPatch): Promise<AppConfiguration> {
    return this.channel.call<AppConfiguration>('updateConfiguration', patch)
  }

  resetConfiguration(): Promise<AppConfiguration> {
    return this.channel.call<AppConfiguration>('resetConfiguration')
  }
}
