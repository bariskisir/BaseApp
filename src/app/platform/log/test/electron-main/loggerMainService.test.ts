import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import { LogChannelClient, createLogChannel } from '@app/platform/log/common/logIpc'
import { LoggerMainService } from '@app/platform/log/electron-main/loggerMainService'
import { afterEach, describe, expect, it, vi } from 'vitest'

const createdLoggers: Array<{
  logId: string
  messages: Array<{ level: string; text: string }>
  transports: {
    file: { level: string | false; maxSize: number; format: string; resolvePathFn?: () => string }
    console: { level: string | false; format: string }
  }
}> = []

vi.mock('electron', () => ({
  app: { name: 'BaseApp' },
}))

vi.mock('electron-log/main', () => ({
  default: {
    create({ logId }: { logId: string }) {
      const messages: Array<{ level: string; text: string }> = []
      const logger = {
        logId,
        messages,
        transports: {
          file: { level: 'info' as string | false, maxSize: 0, format: '' },
          console: { level: 'info' as string | false, format: '' },
        },
        error: (text: string) => messages.push({ level: 'error', text }),
        warn: (text: string) => messages.push({ level: 'warn', text }),
        info: (text: string) => messages.push({ level: 'info', text }),
        debug: (text: string) => messages.push({ level: 'debug', text }),
        verbose: (text: string) => messages.push({ level: 'verbose', text }),
      }
      createdLoggers.push(logger)
      return logger
    },
  },
}))

describe('LoggerMainService and Log IPC channel', () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite()
  const tempDirs: string[] = []

  function createTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'baseapp-logs-'))
    tempDirs.push(dir)
    return dir
  }

  afterEach(() => {
    createdLoggers.length = 0
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('writes logs at all levels, serializes details safely, summarizes/clears logs, and bridges IPC', async () => {
    const dir = createTempDir()
    writeFileSync(join(dir, 'app.2026-11-24.log'), 'line-1\nline-2\n', 'utf8')
    writeFileSync(join(dir, 'app-error.2026-11-24.log'), 'err-1\n', 'utf8')
    writeFileSync(join(dir, 'app.2020-01-01.log'), 'expired\n', 'utf8')
    writeFileSync(join(dir, 'unrelated.txt'), 'keep\n', 'utf8')

    const logger = disposables.add(new LoggerMainService(dir, 'info', 'test'))
    expect(logger.getLevel()).toBe('info')
    expect(logger.getLogsDirectory()).toBe(dir)

    const levelChanges: string[] = []
    disposables.add(logger.onDidChangeLogLevel((level) => levelChanges.push(level)))
    logger.setLevel('debug')
    logger.setLevel('debug')
    expect(levelChanges).toEqual(['debug'])

    const circular: Record<string, unknown> = {}
    circular.self = circular
    const nestedError = new Error('outer', { cause: new Error('inner') })

    logger.error('Mod', 'err msg', nestedError)
    logger.warn('Mod', 'warn msg', circular)
    logger.info('Mod', 'info msg', { ok: true })
    logger.debug('Mod', 'debug msg', 'plain detail')
    logger.verbose('Mod', 'verbose msg', 42n)

    const channel = createLogChannel(logger)
    const client = new LogChannelClient({
      call: <T>(cmd: string, arg?: unknown) => channel.call<T>(1, cmd, arg),
      listen: <T>(evt: string, arg?: unknown) => channel.listen<T>(1, evt, arg),
    })

    await client.writeRenderer({ level: 'warn', module: 'UI', message: 'renderer warning' })
    const summaryBefore = await client.getLogsSummary()
    expect(summaryBefore.fileCount).toBeGreaterThanOrEqual(2)
    expect(summaryBefore.totalBytes).toBeGreaterThan(0)

    const summaryAfter = await client.clearLogs()
    expect(summaryAfter.fileCount).toBe(0)
    expect(summaryAfter.totalBytes).toBe(0)
  })
})
