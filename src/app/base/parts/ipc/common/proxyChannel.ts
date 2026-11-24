import type { Event } from '../../../common/event'
import type { IChannel, IServerChannel } from './ipc'

export interface IFromServiceOptions {
  readonly validators?: Record<string, (arg: unknown) => unknown>
  readonly eventNames?: readonly string[]
}

export interface IToServiceOptions {
  readonly eventNames?: readonly string[]
}

const DISALLOWED_COMMANDS = new Set(['__proto__', 'constructor', 'prototype'])

function isEventProperty(name: string, eventNames?: ReadonlySet<string>): boolean {
  if (eventNames?.has(name)) {
    return true
  }
  return name.startsWith('onDid') || name.startsWith('onWill')
}

function fromService<T extends object>(
  service: T,
  options?: IFromServiceOptions,
): IServerChannel<number> {
  const target = service as Record<string, unknown>
  const validators = options?.validators
  const eventNames = options?.eventNames ? new Set(options.eventNames) : undefined

  return {
    async call<R>(_ctx: number, command: string, arg?: unknown): Promise<R> {
      if (DISALLOWED_COMMANDS.has(command)) {
        throw new Error(`Method not found: ${command}`)
      }

      const member = target[command]
      if (typeof member !== 'function') {
        throw new Error(`Method not found: ${command}`)
      }

      const validator =
        validators && Object.hasOwn(validators, command) ? validators[command] : undefined
      const validatedArg = validator ? validator(arg) : arg

      const fn = member as (...args: unknown[]) => R | Promise<R>
      if (validatedArg === undefined) {
        return await Promise.resolve(fn.call(service))
      }
      if (Array.isArray(validatedArg)) {
        return await Promise.resolve(fn.apply(service, validatedArg))
      }
      return await Promise.resolve(fn.call(service, validatedArg))
    },

    listen<R>(_ctx: number, event: string): Event<R> {
      if (DISALLOWED_COMMANDS.has(event) || !isEventProperty(event, eventNames)) {
        throw new Error(`Event not found: ${event}`)
      }

      const member = target[event]
      if (typeof member !== 'function') {
        throw new Error(`Event not found: ${event}`)
      }

      return member as Event<R>
    },
  }
}

function toService<T extends object>(channel: IChannel, options?: IToServiceOptions): T {
  const eventNames = options?.eventNames ? new Set(options.eventNames) : undefined

  return new Proxy({} as T, {
    get(_target, propKey: PropertyKey): unknown {
      if (typeof propKey !== 'string' || propKey === 'then' || propKey === '_serviceBrand') {
        return undefined
      }

      if (isEventProperty(propKey, eventNames)) {
        return channel.listen(propKey)
      }

      return (...args: unknown[]): Promise<unknown> =>
        channel.call(propKey, args.length <= 1 ? args[0] : args)
    },
  })
}

export const ProxyChannel = {
  fromService,
  toService,
} as const
