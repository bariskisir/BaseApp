/** Sends one privacy-bounded startup event to Microsoft Application Insights. */

import { randomUUID } from 'node:crypto'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveApplicationInsightsConnectionString } from '@shared/appInfo'
import type { AppLocale } from '@shared/types'
import { z } from 'zod'

const telemetryIdentitySchema = z.object({
  revision: z.literal(1),
  installationId: z.uuid(),
})

interface StartupTelemetry {
  appName: string
  enabled: boolean
  version: string
  platform: NodeJS.Platform
  locale: AppLocale
}

interface ApplicationInsightsConnection {
  instrumentationKey: string
  ingestionUrl: string
}

type TelemetryFetcher = typeof fetch

/** Extracts the ingestion identity and endpoint from an Application Insights connection string. */
const parseConnectionString = (connectionString: string): ApplicationInsightsConnection => {
  const fields = new Map(
    connectionString
      .split(';')
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf('=')
        if (separator === -1) return [entry, ''] as const
        return [entry.slice(0, separator), entry.slice(separator + 1)] as const
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

/** Sends the opt-in startup event and persists its anonymous installation identity. */
export default class TelemetryService {
  private readonly identityPath: string
  private startupTracked = false

  /** Creates the telemetry sender without enabling any automatic data collection. */
  public constructor(
    dataRoot: string,
    private readonly fetcher: TelemetryFetcher = fetch,
  ) {
    this.identityPath = join(dataRoot, 'telemetry.json')
  }

  /** Sends at most one startup event per process when telemetry is enabled. */
  public async trackStartup(input: StartupTelemetry): Promise<void> {
    if (!input.enabled || this.startupTracked) return
    this.startupTracked = true

    const applicationInsights = parseConnectionString(
      resolveApplicationInsightsConnectionString(process.env),
    )
    const installationId = await this.loadInstallationId()
    const response = await this.fetcher(applicationInsights.ingestionUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `Microsoft.ApplicationInsights.${applicationInsights.instrumentationKey.replaceAll('-', '')}.Event`,
        time: new Date().toISOString(),
        iKey: applicationInsights.instrumentationKey,
        tags: {
          'ai.application.ver': input.version,
          'ai.user.id': installationId,
        },
        data: {
          baseType: 'EventData',
          baseData: {
            ver: 2,
            name: 'app.startup',
            properties: {
              appName: input.appName,
              version: input.version,
              platform: input.platform,
              locale: input.locale,
            },
          },
        },
      }),
    })
    if (!response.ok) {
      throw new Error(`Application Insights ingestion failed with HTTP ${response.status}.`)
    }
  }

  /** Loads the durable anonymous identifier or creates it after missing/malformed data. */
  private async loadInstallationId(): Promise<string> {
    try {
      const persisted = telemetryIdentitySchema.parse(
        JSON.parse(await readFile(this.identityPath, 'utf8')),
      )
      return persisted.installationId
    } catch {
      const identity = telemetryIdentitySchema.parse({ revision: 1, installationId: randomUUID() })
      const temporaryPath = `${this.identityPath}.${randomUUID()}.tmp`
      try {
        await writeFile(temporaryPath, `${JSON.stringify(identity, null, 2)}\n`, 'utf8')
        await rename(temporaryPath, this.identityPath)
      } catch (error) {
        await unlink(temporaryPath).catch(() => undefined)
        throw error
      }
      return identity.installationId
    }
  }
}
