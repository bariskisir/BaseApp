import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import {
  DEFAULT_CONFIGURATION,
  type IConfigurationService,
} from '@app/platform/configuration/common/configuration'
import type { IEnvironmentMainService } from '@app/platform/environment/electron-main/environmentMainService'
import type { ILogService } from '@app/platform/log/common/log'
import { ProductService } from '@app/platform/product/common/productService'
import { TelemetryMainService } from '@app/platform/telemetry/electron-main/telemetryMainService'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('TelemetryMainService', () => {
  ensureNoDisposablesAreLeakedInTestSuite()
  const tempDirs: string[] = []

  function createTempPath(): string {
    const dir = mkdtempSync(join(tmpdir(), 'baseapp-telemetry-'))
    tempDirs.push(dir)
    return join(dir, 'telemetry.json')
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('skips when disabled, sends startup envelope once when opted in, and logs failures safely', async () => {
    const telemetryPath = createTempPath()
    let telemetryEnabled = false
    const product = new ProductService('2.0.0')
    const env = {
      platform: 'win32' as const,
      telemetryStatePath: telemetryPath,
      telemetryConnectionString:
        'InstrumentationKey=11111111-1111-1111-1111-111111111111;IngestionEndpoint=https://ingest.example.com/',
    } as unknown as IEnvironmentMainService
    const configService = {
      getConfiguration: () => ({ ...DEFAULT_CONFIGURATION, telemetryEnabled }),
    } as unknown as IConfigurationService
    const logService = { warn: vi.fn() } as unknown as ILogService

    const service = new TelemetryMainService(product, env, configService, logService)
    const fetcher = vi.fn(async () => new Response('', { status: 200 }))
    service.setFetcher(fetcher)

    await service.sendStartupEvent()
    expect(fetcher).not.toHaveBeenCalled()

    telemetryEnabled = true
    await service.sendStartupEvent()
    await service.sendStartupEvent()
    expect(fetcher).toHaveBeenCalledTimes(1)
    const persisted = JSON.parse(readFileSync(telemetryPath, 'utf8')) as {
      installationId: string
    }
    expect(persisted.installationId).toMatch(/^[0-9a-f-]{36}$/)

    const failingService = new TelemetryMainService(product, env, configService, logService)
    failingService.setFetcher(vi.fn(async () => new Response('err', { status: 500 })))
    await failingService.sendStartupEvent()
    expect(logService.warn).toHaveBeenCalled()
  })
})
