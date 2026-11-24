import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setUnexpectedErrorHandler } from '@app/base/common/errors'
import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import {
  EnvironmentMainService,
  configureApplicationPaths,
} from '@app/platform/environment/electron-main/environmentMainService'
import { LifecycleMainPhase } from '@app/platform/lifecycle/common/lifecycle'
import {
  type ElectronLifecycleApp,
  LifecycleMainService,
} from '@app/platform/lifecycle/electron-main/lifecycleMainService'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: new EventEmitter(),
}))

describe('LifecycleMainService and EnvironmentMainService', () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite()
  const tempDirs: string[] = []

  function createTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'baseapp-env-'))
    tempDirs.push(dir)
    return dir
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('configures isolated application paths and resolves environment defaults', () => {
    const root = createTempDir()
    const pathsSet: Record<string, string> = {}
    let logsPath = ''
    const paths = configureApplicationPaths(
      {
        getPath: () => root,
        setPath: (name, value) => {
          pathsSet[name] = value
        },
        setAppLogsPath: (value) => {
          logsPath = value ?? ''
        },
      },
      'BaseApp',
    )

    expect(existsSync(paths.dataDirectory)).toBe(true)
    expect(existsSync(paths.logsDirectory)).toBe(true)
    expect(existsSync(paths.runtimeDirectory)).toBe(true)
    expect(existsSync(paths.sessionDirectory)).toBe(true)
    expect(pathsSet.userData).toBe(paths.runtimeDirectory)
    expect(pathsSet.sessionData).toBe(paths.sessionDirectory)
    expect(logsPath).toBe(paths.logsDirectory)

    const env = EnvironmentMainService.fromElectronApp(
      paths,
      { isPackaged: false, getAppPath: () => '/project' },
      {
        VITE_DEV_SERVER_URL: 'http://localhost:5173',
        APPLICATION_INSIGHTS_CONNECTION_STRING:
          'InstrumentationKey=abc;IngestionEndpoint=https://x/',
      },
    )
    expect(env.devServerUrl).toBe('http://localhost:5173')
    expect(env.telemetryConnectionString).toContain('InstrumentationKey=abc')
    expect(env.settingsPath).toBe(join(paths.dataDirectory, 'settings.json'))
    expect(env.sessionsDirectory).toBe(join(paths.dataDirectory, 'sessions'))
  })

  it('advances lifecycle phases, joins async shutdown tasks, and supports relaunch', async () => {
    const appEmitter = new EventEmitter()
    const quit = vi.fn()
    const relaunch = vi.fn()
    const exit = vi.fn()
    const fakeApp: ElectronLifecycleApp = {
      on: (event, listener) => appEmitter.on(event, listener),
      removeListener: (event, listener) => appEmitter.removeListener(event, listener),
      quit,
      relaunch,
      exit,
    }

    const lifecycle = disposables.add(new LifecycleMainService(fakeApp))
    expect(lifecycle.phase).toBe(LifecycleMainPhase.Starting)
    expect(lifecycle.isQuitting).toBe(false)

    const waitReady = lifecycle.when(LifecycleMainPhase.Ready)
    lifecycle.setPhase(LifecycleMainPhase.Ready)
    lifecycle.setPhase(LifecycleMainPhase.Ready)
    await waitReady
    await lifecycle.when(LifecycleMainPhase.Starting)
    expect(() => lifecycle.setPhase(LifecycleMainPhase.Starting)).toThrow('backwards')

    let beforeCount = 0
    disposables.add(
      lifecycle.onBeforeShutdown(() => {
        beforeCount += 1
      }),
    )

    const unexpected: unknown[] = []
    setUnexpectedErrorHandler((error) => unexpected.push(error))
    try {
      let joinCompleted = false
      disposables.add(
        lifecycle.onWillShutdown((event) => {
          event.join(
            'flush',
            new Promise<void>((resolve) => {
              setTimeout(() => {
                joinCompleted = true
                resolve()
              }, 10)
            }),
          )
          event.join('failing', Promise.reject('non-error-failure'))
        }),
      )

      let prevented = false
      appEmitter.emit('will-quit', {
        preventDefault() {
          prevented = true
        },
      })
      expect(prevented).toBe(true)
      expect(beforeCount).toBe(1)

      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(joinCompleted).toBe(true)
      expect(quit).toHaveBeenCalledOnce()
      expect(unexpected).toHaveLength(1)
    } finally {
      setUnexpectedErrorHandler((error) => {
        console.error(error)
      })
    }

    const lifecycle2 = disposables.add(new LifecycleMainService(fakeApp))
    lifecycle2.markQuitting()
    expect(lifecycle2.isQuitting).toBe(true)
    lifecycle2.relaunch()
    expect(relaunch).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(0)
  })
})
