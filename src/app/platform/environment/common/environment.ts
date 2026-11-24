import type { DesktopPlatform } from '@app/base/common/platform'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'

export interface IEnvironmentService {
  readonly _serviceBrand: undefined
  readonly isPackaged: boolean
  readonly platform: DesktopPlatform
  readonly appPath: string
  readonly devServerUrl: string | undefined
  readonly telemetryConnectionString: string | undefined
}

export const IEnvironmentService = createDecorator<IEnvironmentService>('environmentService')
