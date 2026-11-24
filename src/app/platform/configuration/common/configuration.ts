import type { Event } from '@app/base/common/event'
import {
  DATE_FORMATS,
  type DateFormat,
  TIME_FORMATS,
  type TimeFormat,
} from '@app/base/common/formatters'
import { clamp, snapToStep } from '@app/base/common/number'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'
import { type AppLocale, DEFAULT_APP_LOCALE } from '@app/platform/localization/common/localization'
import type { LogLevel } from '@app/platform/log/common/log'
import {
  DEFAULT_ZOOM_LEVEL,
  MAX_ZOOM_LEVEL,
  MIN_ZOOM_LEVEL,
  SIDEBAR_POSITIONS,
  type SideBarPosition,
  ZOOM_LEVEL_STEP,
  clampZoomLevel,
  zoomLevelToZoomFactor,
} from '@app/platform/window/common/window'

export {
  DATE_FORMATS,
  DEFAULT_ZOOM_LEVEL,
  MAX_ZOOM_LEVEL,
  MIN_ZOOM_LEVEL,
  SIDEBAR_POSITIONS,
  TIME_FORMATS,
  ZOOM_LEVEL_STEP,
  clampZoomLevel,
  zoomLevelToZoomFactor,
  type DateFormat,
  type SideBarPosition,
  type TimeFormat,
}

export const RESOLVED_THEME_MODES = ['light', 'dark'] as const
export const THEME_MODES = ['system', ...RESOLVED_THEME_MODES] as const
export const ZOOM_LEVEL_LIMITS = {
  min: MIN_ZOOM_LEVEL,
  max: MAX_ZOOM_LEVEL,
  step: ZOOM_LEVEL_STEP,
  default: DEFAULT_ZOOM_LEVEL,
} as const
export const WINDOW_OPACITY_LIMITS = { min: 0.1, max: 1, step: 0.1, default: 1 } as const
export const TRAY_ICON_PRESETS = ['default', 'bluetooth', 'weather'] as const

export type ResolvedThemeMode = (typeof RESOLVED_THEME_MODES)[number]
export type ThemeMode = (typeof THEME_MODES)[number]
export type TrayIconPreset = (typeof TRAY_ICON_PRESETS)[number]

export const clampWindowOpacity = (value: number): number =>
  clamp(value, WINDOW_OPACITY_LIMITS.min, WINDOW_OPACITY_LIMITS.max)

export const snapWindowOpacity = (value: number): number =>
  snapToStep(
    value,
    WINDOW_OPACITY_LIMITS.min,
    WINDOW_OPACITY_LIMITS.max,
    WINDOW_OPACITY_LIMITS.step,
  )

export interface AppConfiguration {
  settingsRevision: 1
  uiLanguage: AppLocale
  theme: ThemeMode
  sideBarLocation: SideBarPosition
  statusBarVisible: boolean
  zoomLevel: number
  dateFormat: DateFormat
  timeFormat: TimeFormat
  launchAtStartup: boolean
  hardwareAcceleration: boolean
  alwaysOnTop: boolean
  contentProtection: boolean
  windowOpacity: number
  trayIcon: TrayIconPreset
  showTaskbar: boolean
  showTrayIcon: boolean
  minimizeToTrayOnClose: boolean
  startMinimized: boolean
  autoUpdate: boolean
  unattendedUpdates: boolean
  telemetryEnabled: boolean
  logLevel: LogLevel
}

export type AppConfigurationPatch = {
  [Key in keyof Omit<AppConfiguration, 'settingsRevision'>]?: AppConfiguration[Key] | undefined
}

export const DEFAULT_CONFIGURATION: AppConfiguration = {
  settingsRevision: 1,
  uiLanguage: DEFAULT_APP_LOCALE,
  theme: 'system',
  sideBarLocation: 'left',
  statusBarVisible: true,
  zoomLevel: ZOOM_LEVEL_LIMITS.default,
  dateFormat: 'dmy',
  timeFormat: '24-hour',
  launchAtStartup: false,
  hardwareAcceleration: true,
  alwaysOnTop: false,
  contentProtection: true,
  windowOpacity: WINDOW_OPACITY_LIMITS.default,
  trayIcon: 'default',
  showTaskbar: true,
  showTrayIcon: false,
  minimizeToTrayOnClose: false,
  startMinimized: false,
  autoUpdate: true,
  unattendedUpdates: false,
  telemetryEnabled: false,
  logLevel: 'info',
}

export interface ConfigurationExportResult {
  readonly status: 'completed' | 'canceled'
  readonly filePath?: string | undefined
}

export interface ConfigurationImportResult {
  readonly status: 'completed' | 'canceled'
  readonly configuration?: AppConfiguration | undefined
}

export interface IConfigurationChangeEvent {
  readonly configuration: AppConfiguration
  readonly changedKeys: ReadonlySet<keyof AppConfiguration>
  affectsConfiguration(key: keyof AppConfiguration): boolean
}

export interface IConfigurationService {
  readonly _serviceBrand: undefined
  readonly onDidChangeConfiguration: Event<IConfigurationChangeEvent>
  getConfiguration(): AppConfiguration
  getValue<K extends keyof AppConfiguration>(key: K): AppConfiguration[K]
  updateConfiguration(patch: AppConfigurationPatch): Promise<AppConfiguration>
  resetConfiguration(): Promise<AppConfiguration>
  importConfiguration(input: unknown): Promise<AppConfiguration>
}

export const IConfigurationService = createDecorator<IConfigurationService>('configurationService')
