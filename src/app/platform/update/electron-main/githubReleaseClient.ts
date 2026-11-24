import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, rename, unlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  APP_SLUG,
  APP_USER_AGENT,
  DEFAULT_PRODUCT_INFO,
  type IProductService,
} from '@app/platform/product/common/productService'
import { z } from 'zod'
import { type HttpFetchFunction, httpFetch } from './httpFetch'

const GITHUB_ORIGIN = 'https://github.com'
const RELEASE_CACHE_DURATION_MS = 5 * 60 * 1_000
const REQUEST_TIMEOUT_MS = 10 * 60 * 1_000

const releaseAssetSchema = z.object({
  name: z.string().min(1),
  browser_download_url: z.url(),
  size: z.number().int().positive(),
  digest: z.string().nullable().optional(),
})

const releaseSchema = z.object({
  tag_name: z.string().min(1),
  name: z.string().nullable(),
  body: z.string().nullable(),
  html_url: z.url(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  assets: z.array(releaseAssetSchema),
})

export interface GitHubReleaseAsset {
  name: string
  downloadUrl: string
  size: number
  digest?: string
}

export interface GitHubRelease {
  version: string
  name: string
  releaseNotes?: string
  pageUrl: string
  assets: GitHubReleaseAsset[]
}

export interface DownloadedRelease {
  filePath: string
  sha256: string
}

export type DownloadProgressListener = (percent: number) => void

export type ReleaseProductInfo = Pick<
  IProductService,
  'name' | 'slug' | 'repository' | 'releaseApiUrl'
>

function parseVersion(version: string): readonly [number, number, number] {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim())
  if (!match) {
    throw new Error(`Unsupported release version: ${version}`)
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function isNewerVersion(candidate: string, installed: string): boolean {
  const candidateParts = parseVersion(candidate)
  const installedParts = parseVersion(installed)
  for (let index = 0; index < candidateParts.length; index += 1) {
    const candidatePart = candidateParts[index] ?? 0
    const installedPart = installedParts[index] ?? 0
    if (candidatePart !== installedPart) {
      return candidatePart > installedPart
    }
  }
  return false
}

function getReleaseArchitecture(architecture: NodeJS.Architecture): 'x64' | 'arm64' {
  if (architecture === 'x64' || architecture === 'arm64') {
    return architecture
  }
  throw new Error(`Application updates are not available for ${architecture} builds.`)
}

export function selectWindowsInstaller(
  release: GitHubRelease,
  architecture: NodeJS.Architecture,
  slug: string = APP_SLUG,
): GitHubReleaseAsset {
  const releaseArchitecture = getReleaseArchitecture(architecture)
  const expectedName = `${slug}-${release.version}-windows-${releaseArchitecture}-setup.exe`
  const asset = release.assets.find(
    (candidate) => candidate.name.toLowerCase() === expectedName.toLowerCase(),
  )
  if (!asset) {
    throw new Error(`Release ${release.version} does not contain ${expectedName}.`)
  }
  return asset
}

export class GitHubReleaseClient {
  private cachedRelease: { release: GitHubRelease; expiresAt: number } | null = null
  private latestReleaseRequest: Promise<GitHubRelease> | null = null
  private readonly releaseDownloadPathPrefix: string

  constructor(
    private readonly fetcher: HttpFetchFunction = httpFetch,
    private readonly product: ReleaseProductInfo = DEFAULT_PRODUCT_INFO,
  ) {
    this.releaseDownloadPathPrefix = `/${product.repository}/releases/download/`.toLowerCase()
  }

  async getLatestRelease(): Promise<GitHubRelease> {
    if (this.cachedRelease && this.cachedRelease.expiresAt > Date.now()) {
      return this.cachedRelease.release
    }
    if (!this.latestReleaseRequest) {
      this.latestReleaseRequest = this.fetchLatestRelease()
        .then((release) => {
          this.cachedRelease = { release, expiresAt: Date.now() + RELEASE_CACHE_DURATION_MS }
          return release
        })
        .finally(() => {
          this.latestReleaseRequest = null
        })
    }
    return this.latestReleaseRequest
  }

  async downloadInstaller(
    asset: GitHubReleaseAsset,
    destinationDirectory: string,
    onProgress: DownloadProgressListener,
  ): Promise<DownloadedRelease> {
    this.assertTrustedAsset(asset)
    await mkdir(destinationDirectory, { recursive: true })
    const filePath = join(destinationDirectory, asset.name)
    const temporaryPath = `${filePath}.${randomUUID()}.download`
    const response = await this.fetcher(asset.downloadUrl, {
      headers: { 'User-Agent': APP_USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok || !response.body) {
      throw new Error(`Update download failed with HTTP ${response.status}.`)
    }

    const handle = await open(temporaryPath, 'w')
    const hash = createHash('sha256')
    const reader = response.body.getReader()
    let bytesWritten = 0
    let lastProgress = -1
    let handleClosed = false

    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) {
          break
        }
        bytesWritten += chunk.value.byteLength
        if (bytesWritten > asset.size) {
          throw new Error(
            `Update size verification failed: expected ${asset.size}, received more than ${asset.size} bytes.`,
          )
        }
        await handle.write(chunk.value)
        hash.update(chunk.value)
        const progress = Math.min(100, Math.floor((bytesWritten / asset.size) * 100))
        if (progress !== lastProgress) {
          lastProgress = progress
          onProgress(progress)
        }
      }
      await handle.close()
      handleClosed = true

      if (bytesWritten !== asset.size) {
        throw new Error(
          `Update size verification failed: expected ${asset.size}, received ${bytesWritten}.`,
        )
      }
      const sha256 = hash.digest('hex')
      if (asset.digest && asset.digest.toLowerCase() !== `sha256:${sha256}`) {
        throw new Error('Update checksum verification failed.')
      }
      await rename(temporaryPath, filePath)
      onProgress(100)
      return { filePath, sha256 }
    } catch (error) {
      await reader.cancel().catch(() => undefined)
      if (!handleClosed) {
        await handle.close().catch(() => undefined)
      }
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }

  private async fetchLatestRelease(): Promise<GitHubRelease> {
    const response = await this.fetcher(this.product.releaseApiUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': APP_USER_AGENT,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) {
      throw new Error(`GitHub release request failed with HTTP ${response.status}.`)
    }
    return this.parseApiRelease(response)
  }

  private async parseApiRelease(response: Response): Promise<GitHubRelease> {
    const parsed = releaseSchema.parse(await response.json())
    if (parsed.draft || parsed.prerelease) {
      throw new Error('GitHub returned a release that is not a public stable release.')
    }
    const version = parsed.tag_name.replace(/^v/i, '')
    parseVersion(version)
    return {
      version,
      name: parsed.name ?? `${this.product.name} v${version}`,
      ...(parsed.body ? { releaseNotes: parsed.body } : {}),
      pageUrl: parsed.html_url,
      assets: parsed.assets.map((asset) => ({
        name: asset.name,
        downloadUrl: asset.browser_download_url,
        size: asset.size,
        ...(asset.digest ? { digest: asset.digest } : {}),
      })),
    }
  }

  private assertTrustedAsset(asset: GitHubReleaseAsset): void {
    const lowerName = asset.name.toLowerCase()
    if (
      basename(asset.name) !== asset.name ||
      !(lowerName.endsWith('-setup.exe') || lowerName.endsWith('.appimage'))
    ) {
      throw new Error('GitHub returned an invalid update asset name.')
    }
    let downloadUrl: URL
    let decodedFileName: string
    try {
      downloadUrl = new URL(asset.downloadUrl)
      const encodedFileName = downloadUrl.pathname.split('/').at(-1)
      decodedFileName = encodedFileName ? decodeURIComponent(encodedFileName) : ''
    } catch {
      throw new Error('GitHub returned an invalid update download URL.')
    }
    const normalizedPath = downloadUrl.pathname.toLowerCase()
    const hasExpectedFileName = decodedFileName.toLowerCase() === lowerName
    if (
      downloadUrl.origin.toLowerCase() !== GITHUB_ORIGIN ||
      downloadUrl.username ||
      downloadUrl.password ||
      downloadUrl.search ||
      downloadUrl.hash ||
      !normalizedPath.startsWith(this.releaseDownloadPathPrefix) ||
      !hasExpectedFileName
    ) {
      throw new Error('GitHub returned an untrusted update download URL.')
    }
  }
}
