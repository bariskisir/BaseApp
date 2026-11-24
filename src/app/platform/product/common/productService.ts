import { createDecorator } from '@app/platform/instantiation/common/instantiation'

export const APP_NAME = 'BaseApp'
export const APP_SLUG = 'baseapp'
export const APP_OWNER = 'bariskisir'
export const APP_ID = `com.${APP_OWNER}.${APP_SLUG}`
export const APP_USER_AGENT = `${APP_NAME}-Desktop`

const APP_REPO = `${APP_OWNER}/${APP_NAME}`
const APP_REPO_URL = `https://github.com/${APP_REPO}`
const APP_AUTHOR_URL = 'https://www.bariskisir.com'

export interface IProductService {
  readonly _serviceBrand: undefined
  readonly name: string
  readonly slug: string
  readonly version: string
  readonly author: string
  readonly authorUrl: string
  readonly repository: string
  readonly repositoryUrl: string
  readonly releasesUrl: string
  readonly issuesUrl: string
  readonly releaseApiUrl: string
  readonly allowedExternalHosts: readonly string[]
  readonly allowedUpdateDownloadHosts: readonly string[]
  readonly telemetryConnectionStringFallback: string
}

export const IProductService = createDecorator<IProductService>('productService')

export type ProductInfo = Omit<IProductService, '_serviceBrand'>

export const DEFAULT_PRODUCT_INFO: ProductInfo = {
  name: APP_NAME,
  slug: APP_SLUG,
  version: '0.0.0',
  author: 'Barış Kısır',
  authorUrl: APP_AUTHOR_URL,
  repository: APP_REPO,
  repositoryUrl: APP_REPO_URL,
  releasesUrl: `${APP_REPO_URL}/releases`,
  issuesUrl: `${APP_REPO_URL}/issues`,
  releaseApiUrl: `https://api.github.com/repos/${APP_REPO}/releases/latest`,
  allowedExternalHosts: ['github.com', 'www.bariskisir.com'],
  allowedUpdateDownloadHosts: ['github.com'],
  telemetryConnectionStringFallback:
    'InstrumentationKey=57d6037c-32f2-4e33-8afc-9bca358e1edc;IngestionEndpoint=https://northeurope-2.in.applicationinsights.azure.com/;LiveEndpoint=https://northeurope.livediagnostics.monitor.azure.com/;ApplicationId=ff3ae8d8-26c5-4100-ab92-7eb53497d2bf',
}

export class ProductService implements IProductService {
  declare readonly _serviceBrand: undefined
  readonly name: string
  readonly slug: string
  readonly version: string
  readonly author: string
  readonly authorUrl: string
  readonly repository: string
  readonly repositoryUrl: string
  readonly releasesUrl: string
  readonly issuesUrl: string
  readonly releaseApiUrl: string
  readonly allowedExternalHosts: readonly string[]
  readonly allowedUpdateDownloadHosts: readonly string[]
  readonly telemetryConnectionStringFallback: string

  constructor(version: string, overrides?: Partial<Omit<ProductInfo, 'version'>>) {
    const info: ProductInfo = {
      ...DEFAULT_PRODUCT_INFO,
      ...overrides,
      version,
    }
    this.name = info.name
    this.slug = info.slug
    this.version = info.version
    this.author = info.author
    this.authorUrl = info.authorUrl
    this.repository = info.repository
    this.repositoryUrl = info.repositoryUrl
    this.releasesUrl = info.releasesUrl
    this.issuesUrl = info.issuesUrl
    this.releaseApiUrl = info.releaseApiUrl
    this.allowedExternalHosts = [...info.allowedExternalHosts]
    this.allowedUpdateDownloadHosts = [...info.allowedUpdateDownloadHosts]
    this.telemetryConnectionStringFallback = info.telemetryConnectionStringFallback
  }
}
