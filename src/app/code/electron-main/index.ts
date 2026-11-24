import { join } from 'node:path'
import { readJsonFileSync } from '@app/base/node/atomicFile'
import { setAllowedDevOrigin } from '@app/base/parts/ipc/electron-main/validatedIpcMain'
import { parsePersistedConfiguration } from '@app/platform/configuration/common/configurationSchema'
import { configureApplicationPaths } from '@app/platform/environment/electron-main/environmentMainService'
import { APP_SLUG } from '@app/platform/product/common/productService'
import { app } from 'electron'
import { CodeMain } from './main'

function applyPreReadyHardwareAcceleration(settingsPath: string): void {
  try {
    const configuration = parsePersistedConfiguration(readJsonFileSync(settingsPath))
    if (configuration.hardwareAcceleration === false) {
      app.disableHardwareAcceleration()
    }
  } catch {
    return
  }
}

const applicationPaths = configureApplicationPaths(app, APP_SLUG)
applyPreReadyHardwareAcceleration(join(applicationPaths.dataDirectory, 'settings.json'))
setAllowedDevOrigin(process.env.VITE_DEV_SERVER_URL?.trim() || undefined)

const code = new CodeMain(applicationPaths)
void code.main()
