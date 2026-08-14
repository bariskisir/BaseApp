/**
 * Defines and enforces the complete renderer translation contract.
 */

import type { AppLocale } from '@shared/types'

/** Complete renderer translation contract implemented independently by every language. */
export interface LocaleResource {
  app: Record<'name' | 'tagline', string>
  common: Record<'cancel' | 'rename' | 'delete' | 'loading' | 'retry', string>
  nav: Record<'sessions' | 'settings', string>
  sessions: Record<'newSession' | 'renameSession' | 'deleteAll' | 'emptyTitle', string>
  sidebar: Record<'showSidebar' | 'hideSidebar', string>
  workspace: Record<
    | 'title'
    | 'description'
    | 'shellTitle'
    | 'shellDescription'
    | 'sessionsTitle'
    | 'sessionsDescription'
    | 'securityTitle'
    | 'securityDescription'
    | 'compactView'
    | 'fullView',
    string
  >
  windowControls: Record<'minimize' | 'maximize' | 'restore' | 'close', string>
  settings: {
    title: string
    general: string
    display: string
    displaySettings: string
    theme: string
    themeDescription: string
    navbarPosition: string
    navbarPositionDescription: string
    navbarPositions: Record<'left' | 'top', string>
    zoomSettings: string
    pageZoom: string
    pageZoomDescription: string
    zoomOut: string
    zoomIn: string
    resetZoom: string
    traySettings: string
    tray: string
    trayUnavailable: string
    showTrayIcon: string
    showTrayIconDescription: string
    minimizeToTrayOnClose: string
    minimizeToTrayOnCloseDescription: string
    startMinimized: string
    startMinimizedDescription: string
    updates: string
    telemetry: string
    about: string
    interfaceLanguage: string
    interfaceLanguageDescription: string
    timeFormat: string
    timeFormatDescription: string
    timeFormats: Record<'12-hour' | '24-hour', string>
    alwaysOnTop: string
    logging: string
    logLevel: string
    logLevelDescription: string
    logFiles: string
    logFilesDescription: string
    openLogs: string
    logLevels: Record<'error' | 'warn' | 'info' | 'debug' | 'verbose', string>
    checkUpdatesOnStartup: string
    checkUpdatesOnStartupDescription: string
    unattendedUpdates: string
    unattendedUpdatesDescription: string
    version: string
    checkUpdates: string
    checking: string
    upToDate: string
    updateAvailable: string
    downloading: string
    readyToInstall: string
    updateError: string
    installNow: string
    openDownloadPage: string
    releaseNotes: string
    telemetryCollection: string
    telemetryDescription: string
    author: string
    sourceCode: string
  }
  themes: Record<'system' | 'light' | 'dark', string>
  locales: Record<AppLocale, string>
  errors: Record<'generic' | 'startup', string>
}

/** Returns a translation only when it explicitly implements the full English resource contract. */
export const createLocale = (resource: LocaleResource): LocaleResource => resource
