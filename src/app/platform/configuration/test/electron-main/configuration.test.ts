import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import {
  DEFAULT_CONFIGURATION,
  clampWindowOpacity,
  snapWindowOpacity,
} from '@app/platform/configuration/common/configuration'
import {
  ConfigurationChannelClient,
  createConfigurationChannel,
} from '@app/platform/configuration/common/configurationIpc'
import {
  configurationPatchSchema,
  configurationSchema,
  filterConfigurationPatchForPlatform,
  normalizeConfigurationForPlatform,
  parsePersistedConfiguration,
} from '@app/platform/configuration/common/configurationSchema'
import { ConfigurationMainService } from '@app/platform/configuration/electron-main/configurationMainService'
import { afterEach, describe, expect, it } from 'vitest'

describe('platform configuration schema, persistence, and IPC', () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite()
  const tempDirs: string[] = []

  function createTempPath(): string {
    const dir = mkdtempSync(join(tmpdir(), 'baseapp-config-'))
    tempDirs.push(dir)
    return join(dir, 'settings.json')
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('validates schema invariants, migrates legacy pageZoom, and normalizes Linux fields', () => {
    expect(clampWindowOpacity(2)).toBe(1)
    expect(snapWindowOpacity(0.54)).toBe(0.5)

    const migrated = parsePersistedConfiguration({
      pageZoom: 1.44,
      navbarPosition: 'left',
      sideBarLocation: 'right',
      showTrayIcon: false,
      minimizeToTrayOnClose: true,
      startMinimized: true,
    })
    expect(migrated.zoomLevel).toBe(2)
    expect(migrated.sideBarLocation).toBe('right')
    expect(migrated.minimizeToTrayOnClose).toBe(false)
    expect(migrated.startMinimized).toBe(false)
    expect('navbarPosition' in migrated).toBe(false)

    expect(
      configurationSchema.safeParse({
        ...DEFAULT_CONFIGURATION,
        showTrayIcon: false,
        minimizeToTrayOnClose: true,
      }).success,
    ).toBe(false)
    expect(
      configurationSchema.safeParse({
        ...DEFAULT_CONFIGURATION,
        showTrayIcon: false,
        startMinimized: true,
      }).success,
    ).toBe(false)

    expect(configurationPatchSchema.safeParse({}).success).toBe(false)
    expect(configurationPatchSchema.safeParse({ navbarPosition: 'left' }).success).toBe(false)
    expect(configurationPatchSchema.safeParse({ zoomLevel: 1 }).success).toBe(true)

    const linuxNormalized = normalizeConfigurationForPlatform(
      { ...DEFAULT_CONFIGURATION, showTrayIcon: true, launchAtStartup: true, showTaskbar: false },
      'linux',
    )
    expect(linuxNormalized.showTrayIcon).toBe(false)
    expect(linuxNormalized.launchAtStartup).toBe(false)
    expect(linuxNormalized.showTaskbar).toBe(true)

    const linuxFiltered = filterConfigurationPatchForPlatform(
      { showTrayIcon: true, launchAtStartup: true, theme: 'dark' },
      'linux',
    )
    expect(linuxFiltered).toEqual({ theme: 'dark' })
  })

  it('persists, imports, resets, and bridges configuration changes over IPC', async () => {
    const filePath = createTempPath()
    writeFileSync(filePath, '{"theme":"dark","zoomLevel":1}', 'utf8')

    const service = disposables.add(new ConfigurationMainService(filePath, 'win32'))
    const initial = await service.initialize()
    expect(initial.theme).toBe('dark')
    expect(initial.zoomLevel).toBe(1)

    const channel = createConfigurationChannel(service)
    const client = new ConfigurationChannelClient({
      call: <T>(cmd: string, arg?: unknown) => channel.call<T>(1, cmd, arg),
      listen: <T>(evt: string, arg?: unknown) => channel.listen<T>(1, evt, arg),
    })

    const observedThemes: string[] = []
    disposables.add(client.onDidChangeConfiguration((cfg) => observedThemes.push(cfg.theme)))

    const updated = await client.updateConfiguration({ theme: 'light', sideBarLocation: 'right' })
    expect(updated.theme).toBe('light')
    expect(updated.sideBarLocation).toBe('right')
    expect(service.getValue('theme')).toBe('light')

    await expect(service.importConfiguration('invalid')).rejects.toThrow('JSON object')
    const imported = await service.importConfiguration({ uiLanguage: 'tr', zoomLevel: -2 })
    expect(imported.uiLanguage).toBe('tr')
    expect(imported.zoomLevel).toBe(-2)

    const reset = await client.resetConfiguration()
    expect(reset).toEqual(DEFAULT_CONFIGURATION)
    expect(observedThemes).toEqual(['light', 'system', 'system'])
  })
})
