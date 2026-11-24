import { EventEmitter } from 'node:events'
import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import { createElectronUpdateRuntime } from '@app/platform/update/electron-main/electronUpdateRuntime'
import { describe, expect, it, vi } from 'vitest'

const runtimeMocks = vi.hoisted(() => ({
  quit: vi.fn(),
  spawnBehavior: 'spawn' as 'spawn' | 'error',
  unref: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    name: 'BaseApp',
    getVersion: () => '2.0.0',
    getPath: () => '/tmp',
    quit: () => runtimeMocks.quit(),
  },
}))

vi.mock('node:child_process', () => ({
  spawn: () => {
    const emitter = Object.assign(new EventEmitter(), {
      unref: runtimeMocks.unref,
    })
    queueMicrotask(() => {
      if (runtimeMocks.spawnBehavior === 'spawn') {
        emitter.emit('spawn')
      } else {
        emitter.emit('error', new Error('spawn failed'))
      }
    })
    return emitter
  },
}))

describe('createElectronUpdateRuntime', () => {
  ensureNoDisposablesAreLeakedInTestSuite()

  it('builds runtime metadata, delegates quit, and launches detached installers', async () => {
    const runtime = createElectronUpdateRuntime()
    expect(runtime.isPackaged).toBe(true)
    expect(runtime.version).toBe('2.0.0')
    expect(runtime.temporaryDirectory).toContain('BaseApp')

    runtime.quit()
    expect(runtimeMocks.quit).toHaveBeenCalledOnce()

    runtimeMocks.spawnBehavior = 'spawn'
    await runtime.launchInstaller('/tmp/installer.exe')
    expect(runtimeMocks.unref).toHaveBeenCalledOnce()

    runtimeMocks.spawnBehavior = 'error'
    await expect(runtime.launchInstaller('/tmp/bad.exe')).rejects.toThrow('spawn failed')
  })
})
