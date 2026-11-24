import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import { DEFAULT_PRODUCT_INFO } from '@app/platform/product/common/productService'
import type { UpdateStateEvent } from '@app/platform/update/common/update'
import { UpdateChannelClient, createUpdateChannel } from '@app/platform/update/common/updateIpc'
import {
  GitHubReleaseClient,
  isNewerVersion,
  selectWindowsInstaller,
} from '@app/platform/update/electron-main/githubReleaseClient'
import {
  UpdateMainService,
  type UpdateClient,
  type UpdateRuntime,
} from '@app/platform/update/electron-main/updateMainService'
import { afterEach, describe, expect, it, vi } from 'vitest'

function createStreamResponse(payload: Uint8Array, status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(payload.subarray(0, Math.floor(payload.length / 2)))
      controller.enqueue(payload.subarray(Math.floor(payload.length / 2)))
      controller.close()
    },
  })
  return new Response(stream, { status })
}

describe('platform update client, service, and IPC', () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite()
  const tempDirs: string[] = []

  function createTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'baseapp-update-'))
    tempDirs.push(dir)
    return dir
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('compares semver versions, selects Windows installers, fetches releases, and verifies downloads', async () => {
    expect(isNewerVersion('2.1.0', '2.0.0')).toBe(true)
    expect(isNewerVersion('2.0.0', '2.0.0')).toBe(false)
    expect(isNewerVersion('1.9.9', '2.0.0')).toBe(false)
    expect(() => isNewerVersion('bad', '2.0.0')).toThrow('Unsupported release version')

    const payload = new TextEncoder().encode('installer-binary-content')
    const digest = `sha256:${createHash('sha256').update(payload).digest('hex')}`
    const assetName = `${DEFAULT_PRODUCT_INFO.slug}-2.1.0-windows-x64-setup.exe`
    const downloadUrl = `https://github.com/${DEFAULT_PRODUCT_INFO.repository}/releases/download/v2.1.0/${assetName}`

    const fetcher = vi.fn(async (url: string) => {
      if (url === DEFAULT_PRODUCT_INFO.releaseApiUrl) {
        return new Response(
          JSON.stringify({
            tag_name: 'v2.1.0',
            name: 'BaseApp v2.1.0',
            body: 'Release notes here',
            html_url: 'https://github.com/bariskisir/BaseApp/releases/tag/v2.1.0',
            draft: false,
            prerelease: false,
            assets: [
              {
                name: assetName,
                browser_download_url: downloadUrl,
                size: payload.byteLength,
                digest,
              },
            ],
          }),
          { status: 200 },
        )
      }
      return createStreamResponse(payload)
    })

    const client = new GitHubReleaseClient(fetcher as unknown as typeof fetch)
    const release = await client.getLatestRelease()
    const cachedRelease = await client.getLatestRelease()
    expect(cachedRelease).toBe(release)
    expect(fetcher).toHaveBeenCalledTimes(1)

    const asset = selectWindowsInstaller(release, 'x64')
    expect(asset.name).toBe(assetName)
    expect(() => selectWindowsInstaller(release, 'arm64')).toThrow('does not contain')
    expect(() => selectWindowsInstaller(release, 'ia32')).toThrow('not available')

    const progressValues: number[] = []
    const dest = createTempDir()
    const downloaded = await client.downloadInstaller(asset, dest, (pct) =>
      progressValues.push(pct),
    )
    expect(readFileSync(downloaded.filePath)).toEqual(Buffer.from(payload))
    expect(progressValues[progressValues.length - 1]).toBe(100)

    await expect(
      client.downloadInstaller({ ...asset, digest: 'sha256:deadbeef' }, dest, () => undefined),
    ).rejects.toThrow('checksum')
    await expect(
      client.downloadInstaller(
        { ...asset, downloadUrl: 'https://evil.example/a-setup.exe' },
        dest,
        () => undefined,
      ),
    ).rejects.toThrow('untrusted')
  })

  it('orchestrates UpdateMainService states for up-to-date, non-Windows, attended, unattended, and errors', async () => {
    const logger = { error: vi.fn(), info: vi.fn() }
    const launchInstaller = vi.fn(async () => undefined)
    const quit = vi.fn()

    const runtime: UpdateRuntime = {
      isPackaged: true,
      version: '2.0.0',
      architecture: 'x64',
      platform: 'win32',
      temporaryDirectory: createTempDir(),
      quit,
      launchInstaller,
    }

    let latestVersion = '2.0.0'
    const updateClient: UpdateClient = {
      getLatestRelease: async () => ({
        version: latestVersion,
        name: `BaseApp v${latestVersion}`,
        releaseNotes: 'Fixes',
        pageUrl: 'https://github.com/bariskisir/BaseApp/releases/latest',
        assets: [
          {
            name: `${DEFAULT_PRODUCT_INFO.slug}-${latestVersion}-windows-x64-setup.exe`,
            downloadUrl: `https://github.com/${DEFAULT_PRODUCT_INFO.repository}/releases/download/v${latestVersion}/${DEFAULT_PRODUCT_INFO.slug}-${latestVersion}-windows-x64-setup.exe`,
            size: 100,
          },
        ],
      }),
      downloadInstaller: async (_asset, _dir, onProgress) => {
        onProgress(50)
        return { filePath: '/tmp/setup.exe', sha256: 'abc' }
      },
    }

    const service = disposables.add(new UpdateMainService(logger, updateClient, runtime))
    const channel = createUpdateChannel(service)
    const ipcClient = new UpdateChannelClient({
      call: <T>(cmd: string, arg?: unknown) => channel.call<T>(1, cmd, arg),
      listen: <T>(evt: string, arg?: unknown) => channel.listen<T>(1, evt, arg),
    })

    const states: UpdateStateEvent['state'][] = []
    disposables.add(ipcClient.onDidChangeState((event) => states.push(event.state)))

    await expect(ipcClient.quitAndInstall()).rejects.toThrow('No downloaded update')

    await ipcClient.checkForUpdates()
    expect(service.getStateSync()).toEqual({ state: 'up-to-date', version: '2.0.0' })

    latestVersion = '2.1.0'
    runtime.platform = 'darwin'
    await ipcClient.checkForUpdates()
    expect((await ipcClient.getState()).state).toBe('available')

    runtime.platform = 'win32'
    service.applyConfiguration({ autoUpdate: true, unattendedUpdates: true })
    await ipcClient.checkForUpdates()
    expect(launchInstaller).toHaveBeenCalledWith('/tmp/setup.exe')
    expect(quit).toHaveBeenCalledOnce()
    expect(states).toContain('downloading')
    expect(states).toContain('downloaded')
  })

  it('falls back to globalThis.fetch in httpFetch outside Electron', async () => {
    const { httpFetch } = await import('@app/platform/update/electron-main/httpFetch')
    const originalFetch = globalThis.fetch
    const mockFetch = vi.fn(async () => new Response('ok', { status: 200 }))
    globalThis.fetch = mockFetch as unknown as typeof fetch
    try {
      const response = await httpFetch('https://example.com/test')
      expect(await response.text()).toBe('ok')
      expect(mockFetch).toHaveBeenCalledOnce()
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
