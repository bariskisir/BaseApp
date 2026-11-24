import { Emitter, type Event } from '@app/base/common/event'
import { Disposable } from '@app/base/common/lifecycle'
import { InstantiationType, registerSingleton } from '@app/platform/instantiation/common/extensions'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'
import { ILogService } from '@app/platform/log/common/log'
import type { UpdateStateEvent } from '@app/platform/update/common/update'
import { UPDATE_CHANNEL_NAME, UpdateChannelClient } from '@app/platform/update/common/updateIpc'
import { IMainProcessService } from '@app/workbench/services/ipc/electron-browser/mainProcessService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { INotificationService } from '@app/workbench/services/notification/browser/notificationService'

export interface IWorkbenchUpdateService {
  readonly _serviceBrand: undefined
  readonly state: UpdateStateEvent
  readonly onDidChangeState: Event<UpdateStateEvent>
  initialize(): Promise<void>
  checkForUpdates(): Promise<void>
  installUpdate(): Promise<void>
}

export const IWorkbenchUpdateService =
  createDecorator<IWorkbenchUpdateService>('workbenchUpdateService')

export class UpdateWorkbenchService extends Disposable implements IWorkbenchUpdateService {
  declare readonly _serviceBrand: undefined

  private readonly _onDidChangeState = this._register(new Emitter<UpdateStateEvent>())
  readonly onDidChangeState: Event<UpdateStateEvent> = this._onDidChangeState.event

  private readonly channelClient: UpdateChannelClient
  private _state: UpdateStateEvent = { state: 'idle' }

  constructor(
    @IMainProcessService mainProcessService: IMainProcessService,
    @ILogService private readonly logService: ILogService,
    @INotificationService private readonly notificationService: INotificationService,
    @IWorkbenchLocalizationService
    private readonly localizationService: IWorkbenchLocalizationService,
  ) {
    super()
    this.channelClient = new UpdateChannelClient(mainProcessService.getChannel(UPDATE_CHANNEL_NAME))
    this._register(
      this.channelClient.onDidChangeState((nextState) => {
        this.applyState(nextState)
      }),
    )
  }

  get state(): UpdateStateEvent {
    return this._state
  }

  async initialize(): Promise<void> {
    try {
      const currentState = await this.channelClient.getState()
      this.applyState(currentState)
    } catch (error) {
      this.logService.warn(
        'UpdateWorkbenchService',
        'Initial update state could not be loaded.',
        error,
      )
    }
  }

  async checkForUpdates(): Promise<void> {
    try {
      await this.channelClient.checkForUpdates()
    } catch (error) {
      this.logService.error('UpdateWorkbenchService', 'Application update check failed.', error)
    }
  }

  async installUpdate(): Promise<void> {
    try {
      await this.channelClient.quitAndInstall()
    } catch (error) {
      this.logService.error(
        'UpdateWorkbenchService',
        'Downloaded application update could not be installed.',
        error,
      )
      this.notificationService.error(this.localizationService.t('errors.generic'))
    }
  }

  private applyState(nextState: UpdateStateEvent): void {
    if (this.isDisposed) {
      return
    }
    this._state = nextState
    this._onDidChangeState.fire(nextState)
  }
}

registerSingleton(IWorkbenchUpdateService, UpdateWorkbenchService, InstantiationType.Eager)
