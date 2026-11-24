import type { Event } from '@app/base/common/event'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'

export const UPDATE_STATES = [
  'idle',
  'checking',
  'available',
  'downloading',
  'downloaded',
  'up-to-date',
  'error',
] as const

export type UpdateState = (typeof UPDATE_STATES)[number]

export interface UpdateStateEvent {
  state: UpdateState
  version?: string
  percent?: number
  releaseNotes?: string
  message?: string
  pageUrl?: string
}

export interface IUpdateService {
  readonly _serviceBrand: undefined
  readonly onDidChangeState: Event<UpdateStateEvent>
  getState(): Promise<UpdateStateEvent>
  checkForUpdates(): Promise<void>
  quitAndInstall(): Promise<void>
}

export const IUpdateService = createDecorator<IUpdateService>('updateService')
