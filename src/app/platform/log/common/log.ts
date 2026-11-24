import type { Event } from '@app/base/common/event'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'
import { z } from 'zod'

export const LOG_LEVELS = ['error', 'warn', 'info', 'debug', 'verbose'] as const

export type LogLevel = (typeof LOG_LEVELS)[number]

export const LOG_LIMITS = {
  maxModuleLength: 64,
  maxMessageLength: 1_000,
  maxDetailsLength: 8_000,
} as const

export interface LogsSummary {
  fileCount: number
  totalBytes: number
}

export interface RendererLogEntry {
  level: LogLevel
  module: string
  message: string
  details?: string | undefined
}

export const rendererLogEntrySchema = z.object({
  level: z.enum(LOG_LEVELS),
  module: z.string().trim().min(1).max(LOG_LIMITS.maxModuleLength),
  message: z.string().trim().min(1).max(LOG_LIMITS.maxMessageLength),
  details: z.string().max(LOG_LIMITS.maxDetailsLength).optional(),
})

export interface ILogService {
  readonly _serviceBrand: undefined
  getLevel(): LogLevel
  setLevel(level: LogLevel): void
  readonly onDidChangeLogLevel: Event<LogLevel>
  error(module: string, message: string, details?: unknown): void
  warn(module: string, message: string, details?: unknown): void
  info(module: string, message: string, details?: unknown): void
  debug(module: string, message: string, details?: unknown): void
  verbose(module: string, message: string, details?: unknown): void
}

export const ILogService = createDecorator<ILogService>('logService')

export interface ILoggerMainService extends ILogService {
  getLogsDirectory(): string
  getLogsSummary(): Promise<LogsSummary>
  clearLogs(): Promise<LogsSummary>
  writeRenderer(entry: RendererLogEntry): void
}

export const ILoggerMainService = createDecorator<ILoggerMainService>('loggerMainService')
