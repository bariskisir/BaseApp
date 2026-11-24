import { Emitter, type Event } from '@app/base/common/event'
import { Disposable } from '@app/base/common/lifecycle'
import type { AppConfiguration } from '@app/platform/configuration/common/configuration'
import type { IUpdateService, UpdateStateEvent } from '../common/update'
import {
  type DownloadProgressListener,
  type DownloadedRelease,
  type GitHubRelease,
  type GitHubReleaseAsset,
  isNewerVersion,
  selectWindowsInstaller,
} from './githubReleaseClient'

export const WINDOWS_INSTALLER_ARGUMENTS = ['/S', '--updated', '--force-run'] as const

export interface UpdateRuntime {
  isPackaged: boolean
  version: string
  architecture: NodeJS.Architecture
  platform: NodeJS.Platform
  temporaryDirectory: string
  quit(): void
  launchInstaller(filePath: string): Promise<void>
}

export interface UpdateLogger {
  error(module: string, message: string, details?: unknown): void
  info(module: string, message: string, details?: unknown): void
}

export interface UpdateClient {
  getLatestRelease(): Promise<GitHubRelease>
  downloadInstaller(
    asset: GitHubReleaseAsset,
    destinationDirectory: string,
    onProgress: DownloadProgressListener,
  ): Promise<DownloadedRelease>
}

export class UpdateMainService extends Disposable implements IUpdateService {
  declare readonly _serviceBrand: undefined

  private readonly _onDidChangeState = this._register(new Emitter<UpdateStateEvent>())
  readonly onDidChangeState: Event<UpdateStateEvent> = this._onDidChangeState.event

  private currentState: UpdateStateEvent = { state: 'idle' }
  private checkPromise: Promise<void> | null = null
  private downloadedInstallerPath: string | null = null
  private unattendedUpdatesEnabled = false
  private installing = false

  constructor(
    private readonly logger: UpdateLogger,
    private readonly client: UpdateClient,
    private readonly runtime: UpdateRuntime,
  ) {
    super()
  }

  async getState(): Promise<UpdateStateEvent> {
    return this.currentState
  }

  getStateSync(): UpdateStateEvent {
    return this.currentState
  }

  applyConfiguration(config: Pick<AppConfiguration, 'autoUpdate' | 'unattendedUpdates'>): void {
    this.unattendedUpdatesEnabled = config.autoUpdate && config.unattendedUpdates
  }

  async checkForUpdates(): Promise<void> {
    if (this.checkPromise) {
      return this.checkPromise
    }
    this.checkPromise = this.performUpdateCheck().finally(() => {
      this.checkPromise = null
    })
    return this.checkPromise
  }

  async quitAndInstall(): Promise<void> {
    if (!this.downloadedInstallerPath) {
      throw new Error('No downloaded update is ready to install.')
    }
    if (this.installing) {
      return
    }
    this.installing = true
    try {
      this.logger.info('UpdateMainService', 'Launching application update installer.')
      await this.runtime.launchInstaller(this.downloadedInstallerPath)
      this.runtime.quit()
    } catch (error) {
      this.installing = false
      throw error
    }
  }

  private async performUpdateCheck(): Promise<void> {
    this.emit({ state: 'checking' })
    try {
      const release = await this.client.getLatestRelease()
      if (!isNewerVersion(release.version, this.runtime.version)) {
        this.emit({ state: 'up-to-date', version: this.runtime.version })
        return
      }
      if (this.runtime.platform !== 'win32' || !this.runtime.isPackaged) {
        this.emit({
          state: 'available',
          version: release.version,
          pageUrl: release.pageUrl,
          ...(release.releaseNotes ? { releaseNotes: release.releaseNotes } : {}),
        })
        return
      }
      await this.downloadRelease(release)
    } catch (error) {
      this.logger.error('UpdateMainService', 'Desktop update failed.', error)
      const message = error instanceof Error ? error.message : 'Unknown update failure.'
      this.emit({ state: 'error', message })
      throw error
    }
  }

  private async downloadRelease(release: GitHubRelease): Promise<void> {
    const releaseMetadata = {
      version: release.version,
      ...(release.releaseNotes ? { releaseNotes: release.releaseNotes } : {}),
    }
    this.emit({ state: 'available', ...releaseMetadata })
    const asset = selectWindowsInstaller(release, this.runtime.architecture)
    const downloaded = await this.client.downloadInstaller(
      asset,
      this.runtime.temporaryDirectory,
      (percent) => this.emit({ state: 'downloading', percent, ...releaseMetadata }),
    )
    this.downloadedInstallerPath = downloaded.filePath
    this.logger.info('UpdateMainService', 'Application update downloaded.', {
      version: release.version,
      sha256: downloaded.sha256,
    })
    this.emit({ state: 'downloaded', percent: 100, ...releaseMetadata })
    if (this.unattendedUpdatesEnabled) {
      this.logger.info(
        'UpdateMainService',
        'Installing downloaded update without user interaction.',
      )
      await this.quitAndInstall()
    }
  }

  private emit(event: UpdateStateEvent): void {
    this.currentState = event
    this._onDidChangeState.fire(event)
  }
}
