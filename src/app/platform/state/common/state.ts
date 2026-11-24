import { createDecorator } from '@app/platform/instantiation/common/instantiation'

export interface IStateService {
  readonly _serviceBrand: undefined
  getItem<T>(key: string, defaultValue: T): T
  getItem<T>(key: string): T | undefined
  setItem(key: string, data: unknown): void
  removeItem(key: string): void
  flush(): void
}

export const IStateService = createDecorator<IStateService>('stateService')
