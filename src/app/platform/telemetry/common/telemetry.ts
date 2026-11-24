import { createDecorator } from '@app/platform/instantiation/common/instantiation'

export interface ITelemetryService {
  readonly _serviceBrand: undefined
  sendStartupEvent(): Promise<void>
}

export const ITelemetryService = createDecorator<ITelemetryService>('telemetryService')
