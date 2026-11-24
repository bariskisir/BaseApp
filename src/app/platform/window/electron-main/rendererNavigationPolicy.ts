import { posix, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface RendererNavigationPolicyOptions {
  readonly packagedRendererPath: string
  readonly devServerUrl?: string | undefined
  readonly platform?: NodeJS.Platform | undefined
}

function pathsMatch(candidate: string, trusted: string, platform: NodeJS.Platform): boolean {
  const pathImpl = platform === 'win32' ? win32 : posix
  const candidatePath = pathImpl.resolve(candidate)
  const trustedPath = pathImpl.resolve(trusted)
  return platform === 'win32'
    ? candidatePath.toLowerCase() === trustedPath.toLowerCase()
    : candidatePath === trustedPath
}

export function isAllowedRendererNavigation(
  targetUrl: string,
  options: RendererNavigationPolicyOptions,
): boolean {
  try {
    const candidate = new URL(targetUrl)
    if (options.devServerUrl) {
      const trustedDevelopmentUrl = new URL(options.devServerUrl)
      return (
        (candidate.protocol === 'http:' || candidate.protocol === 'https:') &&
        candidate.origin === trustedDevelopmentUrl.origin
      )
    }
    const platform = options.platform ?? process.platform
    return (
      candidate.protocol === 'file:' &&
      pathsMatch(
        fileURLToPath(candidate, { windows: platform === 'win32' }),
        options.packagedRendererPath,
        platform,
      )
    )
  } catch {
    return false
  }
}
