import { mkdir, readdir, stat, truncate, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { Emitter, type Event } from '@app/base/common/event'
import { Disposable } from '@app/base/common/lifecycle'
import { app } from 'electron'
import electronLog from 'electron-log/main'
import {
  type ILoggerMainService,
  LOG_LIMITS,
  type LogLevel,
  type LogsSummary,
  type RendererLogEntry,
} from '../common/log'

const MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024
const GENERAL_RETENTION_DAYS = 30
const ERROR_RETENTION_DAYS = 60

type ElectronLogger = ReturnType<typeof electronLog.create>

const isManagedLogFile = (name: string): boolean =>
  (name.startsWith('app.') || name.startsWith('app-error.')) && /\.log(?:\.\d+)?$/.test(name)

export class LoggerMainService extends Disposable implements ILoggerMainService {
  declare readonly _serviceBrand: undefined

  private readonly _onDidChangeLogLevel = this._register(new Emitter<LogLevel>())
  readonly onDidChangeLogLevel: Event<LogLevel> = this._onDidChangeLogLevel.event

  private readonly appLogger: ElectronLogger
  private readonly errorLogger: ElectronLogger
  private _level: LogLevel | null = null

  constructor(
    private readonly logsDirectory: string,
    initialLevel: LogLevel = 'info',
    logIdPrefix: string = app.name,
  ) {
    super()
    this.appLogger = electronLog.create({ logId: `${logIdPrefix}-app` })
    this.errorLogger = electronLog.create({ logId: `${logIdPrefix}-errors` })
    this.configureLogger(this.appLogger, 'app')
    this.configureLogger(this.errorLogger, 'app-error')
    this.setLevel(initialLevel)
    void this.pruneExpiredLogs()
  }

  getLevel(): LogLevel {
    return this._level ?? 'info'
  }

  setLevel(level: LogLevel): void {
    if (this._level === level) {
      return
    }
    this._level = level
    this.appLogger.transports.file.level = level
    this.appLogger.transports.console.level = level
    const errorFileLevel = level === 'error' ? 'error' : 'warn'
    this.errorLogger.transports.file.level = errorFileLevel
    this.errorLogger.transports.console.level = false
    this._onDidChangeLogLevel.fire(level)
    this.info('LoggerMainService', `Log level changed to ${level}.`)
  }

  getLogsDirectory(): string {
    return this.logsDirectory
  }

  async getLogsSummary(): Promise<LogsSummary> {
    try {
      const entries = await readdir(this.logsDirectory, { withFileTypes: true })
      const logFiles = entries.filter((entry) => entry.isFile() && isManagedLogFile(entry.name))
      const sizes = await Promise.all(
        logFiles.map(async (entry) => {
          try {
            return (await stat(join(this.logsDirectory, entry.name))).size
          } catch {
            return 0
          }
        }),
      )
      return {
        fileCount: logFiles.length,
        totalBytes: sizes.reduce((sum, size) => sum + size, 0),
      }
    } catch {
      return { fileCount: 0, totalBytes: 0 }
    }
  }

  async clearLogs(): Promise<LogsSummary> {
    try {
      const entries = await readdir(this.logsDirectory, { withFileTypes: true })
      const logFiles = entries.filter((entry) => entry.isFile() && isManagedLogFile(entry.name))
      await Promise.all(
        logFiles.map(async (entry) => {
          const fullPath = join(this.logsDirectory, entry.name)
          try {
            await unlink(fullPath)
          } catch {
            await truncate(fullPath, 0).catch(() => undefined)
          }
        }),
      )
    } catch (error) {
      this.warn('LoggerMainService', 'Could not clear log files.', error)
    }
    return this.getLogsSummary()
  }

  writeRenderer(entry: RendererLogEntry): void {
    this.write(entry.level, `Renderer:${entry.module}`, entry.message, entry.details)
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

  private configureLogger(logger: ElectronLogger, prefix: string): void {
    logger.transports.file.maxSize = MAX_LOG_SIZE_BYTES
    logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
    logger.transports.file.resolvePathFn = () =>
      join(this.logsDirectory, `${prefix}.${this.currentDate()}.log`)
    logger.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}'
  }

  private write(level: LogLevel, module: string, message: string, details?: unknown): void {
    const detail = this.serializeDetails(details)
    const text = `[${module}] ${message}${detail ? ` | ${detail}` : ''}`
    this.callLogger(this.appLogger, level, text)
    if (level === 'error' || level === 'warn') {
      this.callLogger(this.errorLogger, level, text)
    }
  }

  private callLogger(logger: ElectronLogger, level: LogLevel, text: string): void {
    if (level === 'error') {
      logger.error(text)
    } else if (level === 'warn') {
      logger.warn(text)
    } else if (level === 'info') {
      logger.info(text)
    } else if (level === 'debug') {
      logger.debug(text)
    } else {
      logger.verbose(text)
    }
  }

  private serializeDetails(details: unknown): string {
    if (details === undefined) {
      return ''
    }
    if (details instanceof Error) {
      const base = `${details.name}: ${details.message}\n${details.stack ?? ''}`.trim()
      const cause =
        details.cause === undefined ? '' : `\nCaused by: ${this.serializeDetails(details.cause)}`
      return `${base}${cause}`.slice(0, LOG_LIMITS.maxDetailsLength)
    }
    if (typeof details === 'string') {
      return details.slice(0, LOG_LIMITS.maxDetailsLength)
    }
    try {
      return JSON.stringify(details).slice(0, LOG_LIMITS.maxDetailsLength)
    } catch {
      if (
        typeof details === 'number' ||
        typeof details === 'boolean' ||
        typeof details === 'bigint' ||
        typeof details === 'symbol'
      ) {
        return String(details).slice(0, LOG_LIMITS.maxDetailsLength)
      }
      return `[Unserializable ${typeof details}]`
    }
  }

  private currentDate(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  private async pruneExpiredLogs(): Promise<void> {
    try {
      await mkdir(this.logsDirectory, { recursive: true })
      const entries = await readdir(this.logsDirectory, { withFileTypes: true })
      const now = Date.now()
      await Promise.all(
        entries.map(async (entry) => {
          if (!entry.isFile()) {
            return
          }
          if (!entry.name.startsWith('app.') && !entry.name.startsWith('app-error.')) {
            return
          }
          const retentionDays = entry.name.startsWith('app-error.')
            ? ERROR_RETENTION_DAYS
            : GENERAL_RETENTION_DAYS
          const createdAt = this.parseLogDate(entry.name)
          if (createdAt !== null && now - createdAt > retentionDays * 86_400_000) {
            await unlink(join(this.logsDirectory, entry.name))
          }
        }),
      )
    } catch (error) {
      this.warn('LoggerMainService', 'Could not prune expired logs.', error)
    }
  }

  private parseLogDate(name: string): number | null {
    const match = /^(?:app|app-error)\.(\d{4})-(\d{2})-(\d{2})\.log(?:\.\d+)?$/.exec(name)
    if (!match) {
      return null
    }
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const date = new Date(year, month - 1, day)
    if (
      Number.isNaN(date.getTime()) ||
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null
    }
    return date.getTime()
  }
}
