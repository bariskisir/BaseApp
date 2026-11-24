import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import {
  SessionsChannelClient,
  createSessionsChannel,
} from '@app/platform/sessions/common/sessionsIpc'
import { SessionsMainService } from '@app/platform/sessions/electron-main/sessionsMainService'
import { afterEach, describe, expect, it } from 'vitest'

describe('platform sessions repository, main service, and IPC', () => {
  ensureNoDisposablesAreLeakedInTestSuite()
  const tempDirs: string[] = []

  function createTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'baseapp-sessions-'))
    tempDirs.push(dir)
    return dir
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('creates, lists, pins, renames, deletes, replaces last session, and enforces IPC validation', async () => {
    const dir = createTempDir()
    writeFileSync(join(dir, 'broken.json'), '{not-valid', 'utf8')

    const service = new SessionsMainService(dir)
    await service.initialize()

    const channel = createSessionsChannel(service)
    const client = new SessionsChannelClient({
      call: <T>(cmd: string, arg?: unknown) => channel.call<T>(1, cmd, arg),
      listen: <T>(evt: string, arg?: unknown) => channel.listen<T>(1, evt, arg),
    })

    const first = await client.createSession()
    expect(first.isDefaultTitle).toBe(true)

    const second = await client.createSession('Release Prep')
    expect(second.isDefaultTitle).toBe(false)
    expect(second.title).toBe('Release Prep')

    const fetched = await client.getSession(second.id)
    expect(fetched.id).toBe(second.id)

    const renamed = await client.renameSession(first.id, 'Daily Notes')
    expect(renamed.title).toBe('Daily Notes')
    expect(renamed.isDefaultTitle).toBe(false)

    await client.setSessionPinned(second.id, true)
    const list = await client.listSessions()
    expect(list).toHaveLength(2)
    expect(list[0]?.id).toBe(second.id)

    const missingDelete = await client.deleteSession('00000000-0000-4000-8000-000000000000')
    expect(missingDelete).toEqual({ deleted: false })

    const deleteFirst = await client.deleteSession(first.id)
    expect(deleteFirst.deleted).toBe(true)
    expect(deleteFirst.replacement).toBeUndefined()

    const deleteLast = await client.deleteSession(second.id)
    expect(deleteLast.deleted).toBe(true)
    expect(deleteLast.replacement).toBeDefined()

    const replacement = await client.deleteAllSessions()
    expect(replacement.isDefaultTitle).toBe(true)
    expect(await client.listSessions()).toHaveLength(1)

    await expect(client.getSession('not-a-uuid')).rejects.toThrow()
    await expect(client.renameSession(replacement.id, '   ')).rejects.toThrow()
  })
})
