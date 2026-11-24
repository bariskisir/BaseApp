import type { Event } from '@app/base/common/event'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'

export enum LifecycleMainPhase {
  Starting = 1,
  Ready = 2,
  AfterWindowOpen = 3,
  Eventually = 4,
}

export interface WillShutdownEvent {
  join(id: string, promise: Promise<void>): void
}

export interface ILifecycleMainService {
  readonly _serviceBrand: undefined
  readonly phase: LifecycleMainPhase
  readonly isQuitting: boolean
  readonly onBeforeShutdown: Event<void>
  readonly onWillShutdown: Event<WillShutdownEvent>
  setPhase(phase: LifecycleMainPhase): void
  when(phase: LifecycleMainPhase): Promise<void>
  markQuitting(): void
  quit(): void
  relaunch(): void
}

export const ILifecycleMainService = createDecorator<ILifecycleMainService>('lifecycleMainService')
