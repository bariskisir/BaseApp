import { createDecorator } from '@app/platform/instantiation/common/instantiation'
import { DEFAULT_PRODUCT_INFO, IProductService } from '@app/platform/product/common/productService'

export interface IExternalUrlPolicy {
  readonly _serviceBrand: undefined
  isAllowed(rawUrl: string): boolean
  assertAllowed(rawUrl: string): URL
}

export const IExternalUrlPolicy = createDecorator<IExternalUrlPolicy>('externalUrlPolicy')

function normalizeAllowedHosts(hosts: readonly string[]): ReadonlySet<string> {
  const normalized = new Set<string>()
  for (const host of hosts) {
    const trimmed = host.trim().toLowerCase()
    if (trimmed.length > 0) {
      normalized.add(trimmed)
    }
  }
  return normalized
}

function parseExternalUrl(rawUrl: string): URL {
  try {
    return new URL(rawUrl)
  } catch {
    throw new Error('Invalid external URL.')
  }
}

function validateAllowedUrl(url: URL, allowedHosts: ReadonlySet<string>): boolean {
  if (url.protocol !== 'https:') {
    return false
  }
  if (url.username.length > 0 || url.password.length > 0) {
    return false
  }
  if (url.port.length > 0) {
    return false
  }
  return allowedHosts.has(url.hostname.toLowerCase())
}

export class ExternalUrlPolicy implements IExternalUrlPolicy {
  declare readonly _serviceBrand: undefined
  private readonly allowedHosts: ReadonlySet<string>

  constructor(@IProductService productService: IProductService) {
    this.allowedHosts = normalizeAllowedHosts(
      productService?.allowedExternalHosts ?? DEFAULT_PRODUCT_INFO.allowedExternalHosts,
    )
  }

  isAllowed(rawUrl: string): boolean {
    try {
      this.assertAllowed(rawUrl)
      return true
    } catch {
      return false
    }
  }

  assertAllowed(rawUrl: string): URL {
    const url = parseExternalUrl(rawUrl)
    if (!validateAllowedUrl(url, this.allowedHosts)) {
      throw new Error('This URL is not allowed.')
    }
    return url
  }
}
