import type { ResolvedThemeMode } from '@app/platform/configuration/common/configuration'

export interface TitleBarOverlayOptions {
  color: string
  symbolColor: string
  height: number
}

export const TITLE_BAR_HEIGHT = 35

export function resolveTitleBarOverlayOptions(theme: ResolvedThemeMode): TitleBarOverlayOptions {
  if (theme === 'dark') {
    return { color: '#181818', symbolColor: '#cccccc', height: TITLE_BAR_HEIGHT }
  }
  return { color: '#f8f8f8', symbolColor: '#1e1e1e', height: TITLE_BAR_HEIGHT }
}
