import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { app } from 'electron'
import { type UpdateRuntime, WINDOWS_INSTALLER_ARGUMENTS } from './updateMainService'

async function launchInstaller(filePath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(filePath, [...WINDOWS_INSTALLER_ARGUMENTS], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

export function createElectronUpdateRuntime(): UpdateRuntime {
  return {
    isPackaged: app.isPackaged,
    version: app.getVersion(),
    architecture: process.arch,
    platform: process.platform,
    temporaryDirectory: join(app.getPath('temp'), app.name, 'Updates'),
    quit: () => app.quit(),
    launchInstaller,
  }
}
