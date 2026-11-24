import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import { StateService } from '@app/platform/state/node/stateService'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('StateService', () => {
  const tempDirs: string[] = []

  function createTempPath(): string {
    const dir = mkdtempSync(join(tmpdir(), 'baseapp-state-'))
    tempDirs.push(dir)
    return join(dir, 'state.json')
  }

  afterEach(() => {
    vi.useRealTimers()
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 })
    }
  })

  const disposables = ensureNoDisposablesAreLeakedInTestSuite()

  it('persists, reloads, removes items, and handles corrupt or non-object state files gracefully', () => {
    vi.useFakeTimers()
    const filePath = createTempPath()
    writeFileSync(filePath, '["not-an-object"]', 'utf8')

    const state = disposables.add(new StateService(filePath, 50))
    expect(state.getItem('missing', 'fallback')).toBe('fallback')
    expect(state.getItem('missing')).toBeUndefined()

    state.setItem('count', 1)
    state.setItem('count', 1)
    state.setItem('flag', true)
    state.setItem('temp', 'delete-me')
    state.setItem('temp', undefined)
    state.removeItem('never-existed')

    vi.advanceTimersByTime(60)
    state.dispose()

    const reloaded = disposables.add(new StateService(filePath, 50))
    expect(reloaded.getItem<number>('count')).toBe(1)
    expect(reloaded.getItem<boolean>('flag')).toBe(true)
    expect(reloaded.getItem('temp')).toBeUndefined()
    reloaded.removeItem('flag')
    reloaded.flush()

    const reloadedAgain = disposables.add(new StateService(filePath, 50))
    expect(reloadedAgain.getItem('flag')).toBeUndefined()
  })
})
