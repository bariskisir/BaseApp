export const DESKTOP_PLATFORMS = ['win32', 'darwin', 'linux'] as const

export type DesktopPlatform = (typeof DESKTOP_PLATFORMS)[number]

export const toDesktopPlatform = (platform: string): DesktopPlatform =>
  DESKTOP_PLATFORMS.includes(platform as DesktopPlatform) ? (platform as DesktopPlatform) : 'linux'

export const isTraySupported = (platform: DesktopPlatform): boolean => platform !== 'linux'

export const isStartupLaunchSupported = (platform: DesktopPlatform): boolean => platform !== 'linux'

interface PlatformGlobal {
  readonly process?: { readonly platform?: string }
  readonly navigator?: { readonly userAgent?: string }
}

export const getCurrentPlatform = (): DesktopPlatform => {
  const host = globalThis as PlatformGlobal
  if (typeof host.process?.platform === 'string') {
    return toDesktopPlatform(host.process.platform)
  }
  const userAgent = host.navigator?.userAgent?.toLowerCase() ?? ''
  if (userAgent.includes('win')) {
    return 'win32'
  }
  if (userAgent.includes('mac')) {
    return 'darwin'
  }
  return 'linux'
}
