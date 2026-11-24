import { randomUUID } from 'node:crypto'
import { readJsonFile, writeJsonFileAtomic } from '@app/base/node/atomicFile'
import { IConfigurationService } from '@app/platform/configuration/common/configuration'
import { IEnvironmentMainService } from '@app/platform/environment/electron-main/environmentMainService'
import type { AppLocale } from '@app/platform/localization/common/localization'
import { ILogService } from '@app/platform/log/common/log'
import { IProductService } from '@app/platform/product/common/productService'
import { type HttpFetchFunction, httpFetch } from '@app/platform/update/electron-main/httpFetch'
import { z } from 'zod'
import type { ITelemetryService } from '../common/telemetry'

const TELEMETRY_TIMEOUT_MS = 10_000

const telemetryIdentitySchema = z.object({
  revision: z.literal(1),
  installationId: z.uuid(),
})

interface ApplicationInsightsConnection {
  readonly instrumentationKey: string
  readonly ingestionUrl: string
}

interface StartupTelemetryPayload {
  readonly appName: string
  readonly version: string
  readonly platform: string
  readonly locale: AppLocale
}

function parseConnectionString(connectionString: string): ApplicationInsightsConnection {
  const fields = new Map(
    connectionString
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf('=')
        if (separator === -1) {
          return [entry, ''] as const
        }
        return [entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()] as const
      }),
  )
  const instrumentationKey = fields.get('InstrumentationKey')
  const ingestionEndpoint = fields.get('IngestionEndpoint')
  if (!instrumentationKey || !ingestionEndpoint) {
    throw new Error('Application Insights connection string is invalid.')
  }
  return {
    instrumentationKey,
    ingestionUrl: new URL('v2/track', ingestionEndpoint).toString(),
  }
}

function buildStartupEnvelope(
  connection: ApplicationInsightsConnection,
  startup: StartupTelemetryPayload,
  installationId: string,
): string {
  return JSON.stringify({
    name: `Microsoft.ApplicationInsights.${connection.instrumentationKey.replaceAll('-', '')}.Event`,
    time: new Date().toISOString(),
    iKey: connection.instrumentationKey,
    tags: {
      'ai.application.ver': startup.version,
      'ai.user.id': installationId,
    },
    data: {
      baseType: 'EventData',
      baseData: {
        ver: 2,
        name: 'app.startup',
        properties: {
          appName: startup.appName,
          version: startup.version,
          platform: startup.platform,
          locale: startup.locale,
        },
      },
    },
  })
}

export class TelemetryMainService implements ITelemetryService {
  declare readonly _serviceBrand: undefined

  private startupTracked = false
  private fetcher: HttpFetchFunction = httpFetch

  constructor(
    @IProductService private readonly productService: IProductService,
    @IEnvironmentMainService private readonly environmentService: IEnvironmentMainService,
    @IConfigurationService private readonly configurationService: IConfigurationService,
    @ILogService private readonly logService: ILogService,
  ) {}

  setFetcher(fetcher: HttpFetchFunction): void {
    this.fetcher = fetcher
  }

  async sendStartupEvent(): Promise<void> {
    const configuration = this.configurationService.getConfiguration()
    if (!configuration.telemetryEnabled || this.startupTracked) {
      return
    }
    this.startupTracked = true

    try {
      const connectionString =
        this.environmentService.telemetryConnectionString?.trim() ||
        this.productService.telemetryConnectionStringFallback
      const connection = parseConnectionString(connectionString)
      const installationId = await this.loadInstallationId()
      const response = await this.fetcher(connection.ingestionUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: buildStartupEnvelope(
          connection,
          {
            appName: this.productService.name,
            version: this.productService.version,
            platform: this.environmentService.platform,
            locale: configuration.uiLanguage,
          },
          installationId,
        ),
        signal: AbortSignal.timeout(TELEMETRY_TIMEOUT_MS),
      })
      if (!response.ok) {
        throw new Error(`Application Insights ingestion failed with HTTP ${response.status}.`)
      }
    } catch (error) {
      this.logService.warn('TelemetryMainService', 'Startup telemetry could not be sent.', error)
    }
  }

  private async loadInstallationId(): Promise<string> {
    const identityPath = this.environmentService.telemetryStatePath
    try {
      const persisted = telemetryIdentitySchema.parse(await readJsonFile(identityPath))
      return persisted.installationId
    } catch {
      const identity = telemetryIdentitySchema.parse({
        revision: 1,
        installationId: randomUUID(),
      })
      await writeJsonFileAtomic(identityPath, identity)
      return identity.installationId
    }
  }
}
