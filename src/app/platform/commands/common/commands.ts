import type { Event } from '@app/base/common/event'
import { type IDisposable, toDisposable } from '@app/base/common/lifecycle'
import {
  type ServicesAccessor,
  createDecorator,
} from '@app/platform/instantiation/common/instantiation'

export interface ICommandEvent {
  readonly commandId: string
  readonly args: unknown[]
}

export type ICommandHandler<Args extends unknown[] = unknown[], R = unknown> = (
  accessor: ServicesAccessor,
  ...args: Args
) => R

export interface ICommand {
  readonly id: string
  readonly handler: ICommandHandler
}

export interface ICommandService {
  readonly _serviceBrand: undefined
  readonly onWillExecuteCommand: Event<ICommandEvent>
  readonly onDidExecuteCommand: Event<ICommandEvent>
  executeCommand<R = unknown>(commandId: string, ...args: unknown[]): Promise<R | undefined>
}

export const ICommandService = createDecorator<ICommandService>('commandService')

export interface ICommandRegistry {
  registerCommand<Args extends unknown[] = unknown[], R = unknown>(
    id: string,
    handler: ICommandHandler<Args, R>,
  ): IDisposable
  registerCommand(command: ICommand): IDisposable
  getCommand(id: string): ICommand | undefined
  getCommands(): Map<string, ICommand>
}

class CommandRegistryImpl implements ICommandRegistry {
  private readonly commands = new Map<string, ICommand[]>()

  registerCommand<Args extends unknown[] = unknown[], R = unknown>(
    idOrCommand: string | ICommand,
    handler?: ICommandHandler<Args, R>,
  ): IDisposable {
    const command: ICommand =
      typeof idOrCommand === 'string'
        ? { id: idOrCommand, handler: handler as ICommandHandler }
        : idOrCommand

    if (!command.id) {
      throw new Error('Command id must be a non-empty string')
    }

    let stack = this.commands.get(command.id)
    if (!stack) {
      stack = []
      this.commands.set(command.id, stack)
    }
    stack.unshift(command)

    return toDisposable(() => {
      const entries = this.commands.get(command.id)
      if (!entries) {
        return
      }
      const index = entries.indexOf(command)
      if (index !== -1) {
        entries.splice(index, 1)
      }
      if (entries.length === 0) {
        this.commands.delete(command.id)
      }
    })
  }

  getCommand(id: string): ICommand | undefined {
    const stack = this.commands.get(id)
    return stack?.[0]
  }

  getCommands(): Map<string, ICommand> {
    const result = new Map<string, ICommand>()
    for (const [id, stack] of this.commands) {
      const head = stack[0]
      if (head) {
        result.set(id, head)
      }
    }
    return result
  }
}

export const CommandsRegistry: ICommandRegistry = new CommandRegistryImpl()
