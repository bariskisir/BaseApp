/**
 * Restricts renderer-requested system-browser navigation to allow-listed origins.
 */

import { APP_AUTHOR_URL } from '@shared/appInfo'

const TRUSTED_EXTERNAL_ORIGINS = new Set([
  new URL('https://github.com').origin,
  new URL(APP_AUTHOR_URL).origin,
])

/** Returns the normalized URL only when it targets a trusted external origin. */
export const resolveTrustedExternalUrl = (candidate: string): string => {
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new Error('Invalid external URL.')
  }
  if (!TRUSTED_EXTERNAL_ORIGINS.has(url.origin)) throw new Error('This URL is not allowed.')
  return url.toString()
}
