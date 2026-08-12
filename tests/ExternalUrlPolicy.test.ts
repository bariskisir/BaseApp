/**
 * Verifies that only allow-listed origins can be opened in the system browser.
 */

import { describe, expect, it } from 'vitest'
import { resolveTrustedExternalUrl } from '../src/main/security/ExternalUrlPolicy'
import { APP_AUTHOR_URL, APP_REPO_URL } from '../src/shared/appInfo'

describe('resolveTrustedExternalUrl', () => {
  it('accepts the project repository and author origins', () => {
    expect(resolveTrustedExternalUrl(APP_REPO_URL)).toBe(APP_REPO_URL)
    expect(resolveTrustedExternalUrl(APP_AUTHOR_URL)).toBe(`${APP_AUTHOR_URL}/`)
  })

  it('accepts release pages below the trusted GitHub origin', () => {
    const releasesUrl = `${APP_REPO_URL}/releases/tag/v1.0.0`
    expect(resolveTrustedExternalUrl(releasesUrl)).toBe(releasesUrl)
  })

  it.each([
    'https://github.com.evil.example/bariskisir',
    'https://raw.githubusercontent.com/bariskisir/BaseApp',
    'http://github.com/bariskisir',
    'file:///C:/Windows/System32/cmd.exe',
  ])('rejects the untrusted origin %s', (url) => {
    expect(() => resolveTrustedExternalUrl(url)).toThrow('This URL is not allowed.')
  })

  it.each(['', 'not-a-url', 'javascript:alert(1)'])('rejects the invalid URL %s', (url) => {
    expect(() => resolveTrustedExternalUrl(url)).toThrow()
  })
})
