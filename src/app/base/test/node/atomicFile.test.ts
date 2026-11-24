import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  readJsonFile,
  readJsonFileSync,
  readTextFile,
  removeInterruptedWrites,
  writeJsonFileAtomic,
  writeJsonFileSyncAtomic,
  writeTextFileAtomic,
} from '@app/base/node/atomicFile'
import { FileOperationQueue } from '@app/base/node/fileOperationQueue'
import { afterEach, describe, expect, it } from 'vitest'

describe('node file I/O primitives', () => {
  const tempDirs: string[] = []

  function createTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'baseapp-base-node-'))
    tempDirs.push(dir)
    return dir
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('writes and reads text and JSON atomically without leaving temp files behind', async () => {
    const dir = createTempDir()
    const nestedText = join(dir, 'nested', 'note.txt')
    const jsonAsync = join(dir, 'data.json')
    const jsonSync = join(dir, 'sync.json')

    await writeTextFileAtomic(nestedText, 'hello world')
    expect(await readTextFile(nestedText)).toBe('hello world')

    await writeJsonFileAtomic(jsonAsync, { count: 2, ok: true })
    expect(await readJsonFile(jsonAsync)).toEqual({ count: 2, ok: true })

    writeJsonFileSyncAtomic(jsonSync, { sync: true })
    expect(readJsonFileSync(jsonSync)).toEqual({ sync: true })

    const entries = await readdir(dir)
    expect(entries.some((name) => name.endsWith('.tmp'))).toBe(false)
  })

  it('removes leftover interrupted temporary files in a directory', async () => {
    const dir = createTempDir()
    writeFileSync(join(dir, 'keep.json'), '{}', 'utf8')
    writeFileSync(join(dir, 'stale.1.tmp'), '{}', 'utf8')
    writeFileSync(join(dir, 'stale.2.tmp'), '{}', 'utf8')

    await removeInterruptedWrites(dir)
    const remaining = await readdir(dir)
    expect(remaining).toEqual(['keep.json'])
  })

  it('serializes operations per key in FileOperationQueue while allowing distinct keys', async () => {
    const queue = new FileOperationQueue()
    const log: string[] = []

    const op1 = queue.run('alpha', async () => {
      log.push('alpha:1:start')
      await new Promise((resolve) => setTimeout(resolve, 20))
      log.push('alpha:1:end')
      return 'one'
    })
    const op2 = queue.run('alpha', async () => {
      log.push('alpha:2:start')
      throw new Error('alpha-failed')
    })
    const op3 = queue.run('alpha', async () => {
      log.push('alpha:3:start')
      return 'three'
    })
    const beta = queue.run('beta', async () => {
      log.push('beta:1')
      return 'beta'
    })

    expect(await op1).toBe('one')
    await expect(op2).rejects.toThrow('alpha-failed')
    expect(await op3).toBe('three')
    expect(await beta).toBe('beta')
    expect(log.indexOf('alpha:1:end')).toBeLessThan(log.indexOf('alpha:2:start'))
    expect(log.indexOf('alpha:2:start')).toBeLessThan(log.indexOf('alpha:3:start'))
  })
})
