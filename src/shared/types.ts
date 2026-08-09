/**
 * Defines serializable domain models and cross-process application contracts.
 */

export const APP_LOCALES = ['en', 'tr', 'de', 'fr', 'pt', 'zh', 'es', 'ru', 'ja', 'ko'] as const
export const THEME_MODES = ['system', 'light', 'dark'] as const
export const NAVBAR_POSITIONS = ['left', 'top'] as const
/** Defines the supported page zoom range and control increment. */
export const PAGE_ZOOM_LIMITS = { min: 0.5, max: 2, step: 0.1, default: 1 } as const
export const TIME_FORMATS = ['24-hour', '12-hour'] as const
export const LOG_LEVELS = ['error', 'warn', 'info', 'debug', 'verbose'] as const

/** Supported renderer locale code. */
export type AppLocale = (typeof APP_LOCALES)[number]
/** Default and fallback renderer language. */
export const DEFAULT_APP_LOCALE: AppLocale = 'en'
/** Persisted application theme preference. */
export type ThemeMode = (typeof THEME_MODES)[number]
/** Placement of global application navigation. */
export type NavbarPosition = (typeof NAVBAR_POSITIONS)[number]
/** Clock format used for session timestamps. */
export type TimeFormat = (typeof TIME_FORMATS)[number]
/** Supported diagnostic logging level. */
export type LogLevel = (typeof LOG_LEVELS)[number]
/** Desktop platforms supported by the Electron shell. */
export type DesktopPlatform = 'win32' | 'darwin' | 'linux'

/** Persisted settings owned by the reusable desktop shell. */
export interface AppSettings {
  settingsRevision: 1
  uiLanguage: AppLocale
  theme: ThemeMode
  navbarPosition: NavbarPosition
  pageZoom: number
  timeFormat: TimeFormat
  alwaysOnTop: boolean
  showTrayIcon: boolean
  minimizeToTrayOnClose: boolean
  autoUpdate: boolean
  unattendedUpdates: boolean
  telemetryEnabled: boolean
  logLevel: LogLevel
}

/** Partial settings update accepted by the persistence boundary. */
export type AppSettingsPatch = {
  [Key in keyof Omit<AppSettings, 'settingsRevision'>]?: AppSettings[Key] | undefined
}

/** Default desktop-shell settings for a fresh installation. */
export const DEFAULT_SETTINGS: AppSettings = {
  settingsRevision: 1,
  uiLanguage: DEFAULT_APP_LOCALE,
  theme: 'system',
  navbarPosition: 'top',
  pageZoom: PAGE_ZOOM_LIMITS.default,
  timeFormat: '24-hour',
  alwaysOnTop: false,
  showTrayIcon: true,
  minimizeToTrayOnClose: true,
  autoUpdate: true,
  unattendedUpdates: false,
  telemetryEnabled: false,
  logLevel: 'info',
}

/** Generic extension data reserved for downstream applications. */
export type SessionData = Record<string, unknown>

/** Complete locally persisted generic session workspace. */
export interface SessionDocument {
  id: string
  title: string
  isDefaultTitle: boolean
  createdAt: string
  updatedAt: string
  data: SessionData
}

/** Compact session metadata used by the persistent sidebar. */
export interface SessionSummary {
  id: string
  title: string
  isDefaultTitle: boolean
  createdAt: string
  updatedAt: string
}

/** Initial renderer state returned by the main process. */
export interface BootstrapPayload {
  settings: AppSettings
  sessions: SessionSummary[]
  currentSession: SessionDocument
  platform: DesktopPlatform
  version: string
}

/** Result of deleting a session while preserving one ready workspace. */
export interface DeleteSessionResult {
  deleted: boolean
  replacement?: SessionDocument
}

/** Renderer diagnostic accepted by the main-process logger. */
export interface RendererLogEntry {
  level: LogLevel
  module: string
  message: string
  details?: string
}

/** Lifecycle state emitted by the desktop update service. */
export interface UpdateStateEvent {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'
  version?: string
  percent?: number
  releaseNotes?: string
  message?: string
  pageUrl?: string
}

/** Capability-limited API exposed by the preload bridge. */
export interface AppApi {
  /** Loads persisted settings, sessions, and application metadata. */
  bootstrap(): Promise<BootstrapPayload>
  /** Atomically merges and persists validated application settings fields. */
  saveSettings(patch: AppSettingsPatch): Promise<AppSettings>
  /** Creates and persists one empty generic session workspace. */
  createSession(): Promise<SessionDocument>
  /** Loads one complete session. */
  getSession(id: string): Promise<SessionDocument>
  /** Renames one session and returns the updated document. */
  renameSession(id: string, title: string): Promise<SessionDocument>
  /** Deletes one session while preserving the last-workspace invariant. */
  deleteSession(id: string): Promise<DeleteSessionResult>
  /** Changes the native always-on-top state. */
  setAlwaysOnTop(enabled: boolean): Promise<void>
  /** Minimizes the main application window. */
  minimizeWindow(): Promise<void>
  /** Toggles maximized state and returns the resulting state. */
  toggleMaximizeWindow(): Promise<boolean>
  /** Closes the main application window. */
  closeWindow(): Promise<void>
  /** Reports whether the main application window is maximized. */
  isWindowMaximized(): Promise<boolean>
  /** Synchronizes native window chrome with the resolved renderer theme. */
  setTheme(theme: Exclude<ThemeMode, 'system'>): Promise<void>
  /** Opens an allow-listed URL in the system browser. */
  openExternal(url: string): Promise<void>
  /** Opens the application log directory in the operating-system file manager. */
  openLogsDirectory(): Promise<void>
  /** Persists one validated renderer diagnostic through the main logger. */
  writeLog(entry: RendererLogEntry): void
  /** Checks GitHub Releases for an application update. */
  checkForUpdates(): Promise<void>
  /** Restarts and installs a downloaded update. */
  installUpdate(): Promise<void>
  /** Subscribes to updater lifecycle events. */
  onUpdateState(listener: (event: UpdateStateEvent) => void): () => void
  /** Subscribes to native maximize and restore state changes. */
  onWindowMaximizedChange(listener: (maximized: boolean) => void): () => void
  /** Subscribes to settings navigation requested from native desktop UI. */
  onSettingsOpenRequested(listener: () => void): () => void
}
