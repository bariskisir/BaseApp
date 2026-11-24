import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { type DesktopPlatform, toDesktopPlatform } from '@app/base/common/platform'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'
import type { IEnvironmentService } from '../common/environment'

export interface ApplicationPaths {
  readonly applicationDataRoot: string
  readonly dataDirectory: string
  readonly logsDirectory: string
  readonly runtimeDirectory: string
  readonly sessionDirectory: string
}

export interface ElectronAppPathsTarget {
  getPath(name: 'appData'): string
  setPath(name: 'userData' | 'sessionData', path: string): void
  setAppLogsPath(path?: string): void
}

export interface ElectronAppEnvironmentSource {
  readonly isPackaged: boolean
  getAppPath(): string
}

export interface IEnvironmentMainService extends IEnvironmentService {
  readonly dataDirectory: string
  readonly runtimeDirectory: string
  readonly logsDirectory: string
  readonly sessionsDirectory: string
  readonly settingsPath: string
  readonly windowStatePath: string
  readonly telemetryStatePath: string
  readonly preloadPath: string
  readonly rendererHtmlPath: string
  readonly resourcesPath: string
}

export const IEnvironmentMainService =
  createDecorator<IEnvironmentMainService>('environmentMainService')

export interface EnvironmentMainServiceOptions {
  readonly paths: ApplicationPaths
  readonly isPackaged: boolean
  readonly appPath: string
  readonly platform?: DesktopPlatform | undefined
  readonly resourcesPath?: string | undefined
  readonly preloadPath?: string | undefined
  readonly rendererHtmlPath?: string | undefined
  readonly env?: Readonly<Record<string, string | undefined>> | undefined
}

export function configureApplicationPaths(
  electronApp: ElectronAppPathsTarget,
  slug: string,
): ApplicationPaths {
  const applicationDataRoot = join(electronApp.getPath('appData'), slug)
  const dataDirectory = join(applicationDataRoot, 'Data')
  const logsDirectory = join(applicationDataRoot, 'Logs')
  const runtimeDirectory = join(applicationDataRoot, 'Runtime')
  const sessionDirectory = join(runtimeDirectory, 'Session')

  for (const directory of [
    applicationDataRoot,
    dataDirectory,
    logsDirectory,
    runtimeDirectory,
    sessionDirectory,
  ]) {
    mkdirSync(directory, { recursive: true })
  }

  electronApp.setPath('userData', runtimeDirectory)
  electronApp.setPath('sessionData', sessionDirectory)
  electronApp.setAppLogsPath(logsDirectory)

  return {
    applicationDataRoot,
    dataDirectory,
    logsDirectory,
    runtimeDirectory,
    sessionDirectory,
  }
}

export class EnvironmentMainService implements IEnvironmentMainService {
  declare readonly _serviceBrand: undefined
  readonly isPackaged: boolean
  readonly platform: DesktopPlatform
  readonly appPath: string
  readonly devServerUrl: string | undefined
  readonly telemetryConnectionString: string | undefined
  readonly dataDirectory: string
  readonly runtimeDirectory: string
  readonly logsDirectory: string
  readonly sessionsDirectory: string
  readonly settingsPath: string
  readonly windowStatePath: string
  readonly telemetryStatePath: string
  readonly preloadPath: string
  readonly rendererHtmlPath: string
  readonly resourcesPath: string

  constructor(options: EnvironmentMainServiceOptions) {
    const env = options.env ?? process.env
    this.isPackaged = options.isPackaged
    this.platform = options.platform ?? toDesktopPlatform(process.platform)
    this.appPath = options.appPath
    this.devServerUrl = env.VITE_DEV_SERVER_URL?.trim() || undefined
    this.telemetryConnectionString = env.APPLICATION_INSIGHTS_CONNECTION_STRING?.trim() || undefined
    this.dataDirectory = options.paths.dataDirectory
    this.runtimeDirectory = options.paths.runtimeDirectory
    this.logsDirectory = options.paths.logsDirectory
    this.sessionsDirectory = join(options.paths.dataDirectory, 'sessions')
    this.settingsPath = join(options.paths.dataDirectory, 'settings.json')
    this.windowStatePath = join(options.paths.dataDirectory, 'window-state.json')
    this.telemetryStatePath = join(options.paths.dataDirectory, 'telemetry.json')
    this.preloadPath = options.preloadPath ?? join(options.appPath, 'out', 'preload', 'preload.js')
    this.rendererHtmlPath =
      options.rendererHtmlPath ?? join(options.appPath, 'out', 'renderer', 'index.html')
    this.resourcesPath =
      options.resourcesPath ??
      (options.isPackaged ? process.resourcesPath : join(options.appPath, 'build'))
  }

  static fromElectronApp(
    paths: ApplicationPaths,
    electronApp: ElectronAppEnvironmentSource,
    env: Readonly<Record<string, string | undefined>> = process.env,
  ): EnvironmentMainService {
    return new EnvironmentMainService({
      paths,
      isPackaged: electronApp.isPackaged,
      appPath: electronApp.getAppPath(),
      env,
    })
  }
}
