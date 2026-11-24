import { Emitter, type Event } from '@app/base/common/event'
import { Disposable } from '@app/base/common/lifecycle'
import { InstantiationType, registerSingleton } from '@app/platform/instantiation/common/extensions'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'
import {
  type ILogService,
  LOG_LIMITS,
  type LogLevel,
  type LogsSummary,
  type RendererLogEntry,
} from '@app/platform/log/common/log'
import { LOG_CHANNEL_NAME, LogChannelClient } from '@app/platform/log/common/logIpc'
import { INativeHostService } from '@app/platform/native/common/native'
import { IMainProcessService } from '@app/workbench/services/ipc/electron-browser/mainProcessService'

export interface IWorkbenchLogService extends ILogService {
  getLogsSummary(): Promise<LogsSummary>
  clearLogs(): Promise<LogsSummary>
  openLogsDirectory(): Promise<void>
}

export const IWorkbenchLogService = createDecorator<IWorkbenchLogService>('workbenchLogService')

function serializeLogDetails(details: unknown): string {
  if (details instanceof Error) {
    const stack = details.stack?.trim()
    return stack || `${details.name}: ${details.message}`
  }
  if (typeof details === 'string') {
    return details
  }
  try {
    const serialized = JSON.stringify(details)
    if (serialized !== undefined) {
      return serialized
    }
  } catch {
    return String(details)
  }
  return String(details)
}

export class RendererLogService extends Disposable implements IWorkbenchLogService {
  declare readonly _serviceBrand: undefined

  private readonly _onDidChangeLogLevel = this._register(new Emitter<LogLevel>())
  readonly onDidChangeLogLevel: Event<LogLevel> = this._onDidChangeLogLevel.event

  private readonly channelClient: LogChannelClient
  private _level: LogLevel = 'info'

  constructor(
    @IMainProcessService mainProcessService: IMainProcessService,
    @INativeHostService private readonly nativeHostService: INativeHostService,
  ) {
    super()
    this.channelClient = new LogChannelClient(mainProcessService.getChannel(LOG_CHANNEL_NAME))
  }

  getLevel(): LogLevel {
    return this._level
  }

  setLevel(level: LogLevel): void {
    if (this._level === level) {
      return
    }
    this._level = level
    this._onDidChangeLogLevel.fire(level)
  }

  error(module: string, message: string, details?: unknown): void {
    this.write('error', module, message, details)
  }

  warn(module: string, message: string, details?: unknown): void {
    this.write('warn', module, message, details)
  }

  info(module: string, message: string, details?: unknown): void {
    this.write('info', module, message, details)
  }

  debug(module: string, message: string, details?: unknown): void {
    this.write('debug', module, message, details)
  }

  verbose(module: string, message: string, details?: unknown): void {
    this.write('verbose', module, message, details)
  }

  getLogsSummary(): Promise<LogsSummary> {
    return this.channelClient.getLogsSummary()
  }

  clearLogs(): Promise<LogsSummary> {
    return this.channelClient.clearLogs()
  }

  openLogsDirectory(): Promise<void> {
    return this.nativeHostService.openLogsDirectory()
  }

  private write(level: LogLevel, module: string, message: string, details?: unknown): void {
    if (this.isDisposed) {
      return
    }
    const normalizedModule = (module.trim() || 'Renderer').slice(0, LOG_LIMITS.maxModuleLength)
    const normalizedMessage = message.trim().slice(0, LOG_LIMITS.maxMessageLength)
    if (normalizedMessage.length === 0) {
      return
    }
    const entry: RendererLogEntry =
      details === undefined
        ? {
            level,
            module: normalizedModule,
            message: normalizedMessage,
          }
        : {
            level,
            module: normalizedModule,
            message: normalizedMessage,
            details: serializeLogDetails(details).slice(0, LOG_LIMITS.maxDetailsLength),
          }
    void this.channelClient.writeRenderer(entry).catch(() => undefined)
  }
}

registerSingleton(IWorkbenchLogService, RendererLogService, InstantiationType.Eager)
