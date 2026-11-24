import { Emitter, type Event } from '@app/base/common/event'
import { Disposable } from '@app/base/common/lifecycle'
import {
  CommandsRegistry,
  type ICommandEvent,
  ICommandService,
} from '@app/platform/commands/common/commands'
import { InstantiationType, registerSingleton } from '@app/platform/instantiation/common/extensions'
import { IInstantiationService } from '@app/platform/instantiation/common/instantiation'
import { ILogService } from '@app/platform/log/common/log'

export class CommandService extends Disposable implements ICommandService {
  declare readonly _serviceBrand: undefined

  private readonly _onWillExecuteCommand = this._register(new Emitter<ICommandEvent>())
  readonly onWillExecuteCommand: Event<ICommandEvent> = this._onWillExecuteCommand.event

  private readonly _onDidExecuteCommand = this._register(new Emitter<ICommandEvent>())
  readonly onDidExecuteCommand: Event<ICommandEvent> = this._onDidExecuteCommand.event

  constructor(
    @IInstantiationService private readonly instantiationService: IInstantiationService,
    @ILogService private readonly logService: ILogService,
  ) {
    super()
  }

  async executeCommand<R = unknown>(commandId: string, ...args: unknown[]): Promise<R | undefined> {
    const command = CommandsRegistry.getCommand(commandId)
    if (!command) {
      throw new Error(`Command "${commandId}" not found.`)
    }
    const event: ICommandEvent = { commandId, args }
    this._onWillExecuteCommand.fire(event)
    try {
      const result = await this.instantiationService.invokeFunction(command.handler, ...args)
      this._onDidExecuteCommand.fire(event)
      return result as R | undefined
    } catch (error) {
      this.logService.error('CommandService', `Command "${commandId}" failed.`, error)
      throw error
    }
  }
}

registerSingleton(ICommandService, CommandService, InstantiationType.Eager)
