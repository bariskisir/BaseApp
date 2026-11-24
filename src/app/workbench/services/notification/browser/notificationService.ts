import { Emitter, type Event } from '@app/base/common/event'
import { Disposable } from '@app/base/common/lifecycle'
import { InstantiationType, registerSingleton } from '@app/platform/instantiation/common/extensions'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error'

export interface INotificationMessage {
  readonly severity: NotificationSeverity
  readonly text: string
}

export interface INotificationService {
  readonly _serviceBrand: undefined
  readonly onDidNotify: Event<INotificationMessage>
  notify(severity: NotificationSeverity, text: string): void
  info(text: string): void
  success(text: string): void
  warning(text: string): void
  error(text: string): void
}

export const INotificationService = createDecorator<INotificationService>('notificationService')

export class NotificationService extends Disposable implements INotificationService {
  declare readonly _serviceBrand: undefined

  private readonly _onDidNotify = this._register(new Emitter<INotificationMessage>())
  readonly onDidNotify: Event<INotificationMessage> = this._onDidNotify.event

  notify(severity: NotificationSeverity, text: string): void {
    if (this.isDisposed || text.length === 0) {
      return
    }
    this._onDidNotify.fire({ severity, text })
  }

  info(text: string): void {
    this.notify('info', text)
  }

  success(text: string): void {
    this.notify('success', text)
  }

  warning(text: string): void {
    this.notify('warning', text)
  }

  error(text: string): void {
    this.notify('error', text)
  }
}

registerSingleton(INotificationService, NotificationService, InstantiationType.Eager)
