import { DATE_FORMATS, TIME_FORMATS } from '@app/base/common/formatters'
import {
  type DesktopPlatform,
  isStartupLaunchSupported,
  isTraySupported,
} from '@app/base/common/platform'
import { APP_LOCALES } from '@app/platform/localization/common/localization'
import { LOG_LEVELS } from '@app/platform/log/common/log'
import { SIDEBAR_POSITIONS, zoomFactorToZoomLevel } from '@app/platform/window/common/window'
import { z } from 'zod'
import {
  type AppConfiguration,
  type AppConfigurationPatch,
  DEFAULT_CONFIGURATION,
  THEME_MODES,
  TRAY_ICON_PRESETS,
  WINDOW_OPACITY_LIMITS,
  ZOOM_LEVEL_LIMITS,
} from './configuration'

const configurationFieldsSchema = z.object({
  settingsRevision: z.literal(1),
  uiLanguage: z.enum(APP_LOCALES),
  theme: z.enum(THEME_MODES),
  sideBarLocation: z.enum(SIDEBAR_POSITIONS),
  statusBarVisible: z.boolean(),
  zoomLevel: z.number().min(ZOOM_LEVEL_LIMITS.min).max(ZOOM_LEVEL_LIMITS.max),
  dateFormat: z.enum(DATE_FORMATS),
  timeFormat: z.enum(TIME_FORMATS),
  launchAtStartup: z.boolean(),
  hardwareAcceleration: z.boolean(),
  alwaysOnTop: z.boolean(),
  contentProtection: z.boolean(),
  windowOpacity: z.number().min(WINDOW_OPACITY_LIMITS.min).max(WINDOW_OPACITY_LIMITS.max),
  trayIcon: z.enum(TRAY_ICON_PRESETS),
  showTaskbar: z.boolean(),
  showTrayIcon: z.boolean(),
  minimizeToTrayOnClose: z.boolean(),
  startMinimized: z.boolean(),
  autoUpdate: z.boolean(),
  unattendedUpdates: z.boolean(),
  telemetryEnabled: z.boolean(),
  logLevel: z.enum(LOG_LEVELS),
})

export const configurationSchema = configurationFieldsSchema.superRefine(
  (configuration, context) => {
    if (configuration.minimizeToTrayOnClose && !configuration.showTrayIcon) {
      context.addIssue({
        code: 'custom',
        path: ['minimizeToTrayOnClose'],
        message: 'Minimize to tray requires the tray icon to be enabled.',
      })
    }
    if (configuration.startMinimized && !configuration.showTrayIcon) {
      context.addIssue({
        code: 'custom',
        path: ['startMinimized'],
        message: 'Starting minimized requires the tray icon to be enabled.',
      })
    }
  },
)

export const configurationPatchSchema = configurationFieldsSchema
  .omit({ settingsRevision: true })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'At least one setting must be provided.')

const TRAY_DEPENDENT_KEYS = new Set<keyof AppConfigurationPatch>([
  'showTrayIcon',
  'minimizeToTrayOnClose',
  'startMinimized',
  'showTaskbar',
])

export function normalizeConfigurationForPlatform(
  configuration: AppConfiguration,
  platform: DesktopPlatform,
): AppConfiguration {
  const traySupported = isTraySupported(platform)
  const startupSupported = isStartupLaunchSupported(platform)
  if (traySupported && startupSupported) {
    return configuration
  }
  return {
    ...configuration,
    ...(traySupported
      ? {}
      : {
          showTrayIcon: false,
          minimizeToTrayOnClose: false,
          startMinimized: false,
          showTaskbar: true,
        }),
    ...(startupSupported ? {} : { launchAtStartup: false }),
  }
}

export function filterConfigurationPatchForPlatform(
  patch: AppConfigurationPatch,
  platform: DesktopPlatform,
): AppConfigurationPatch {
  const traySupported = isTraySupported(platform)
  const startupSupported = isStartupLaunchSupported(platform)
  if (traySupported && startupSupported) {
    return patch
  }
  const filtered: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    const typedKey = key as keyof AppConfigurationPatch
    if (!traySupported && TRAY_DEPENDENT_KEYS.has(typedKey)) {
      continue
    }
    if (!startupSupported && typedKey === 'launchAtStartup') {
      continue
    }
    filtered[key] = value
  }
  return filtered as AppConfigurationPatch
}

function asConfigurationRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {}
}

export function parsePersistedConfiguration(input: unknown): AppConfiguration {
  const persisted = asConfigurationRecord(input)
  const restored: Record<string, unknown> = {}
  for (const [field, fieldSchema] of Object.entries(configurationFieldsSchema.shape)) {
    const rawValue =
      field === 'zoomLevel' &&
      persisted.zoomLevel === undefined &&
      typeof persisted.pageZoom === 'number'
        ? zoomFactorToZoomLevel(persisted.pageZoom)
        : persisted[field]
    const parsed = fieldSchema.safeParse(rawValue)
    restored[field] = parsed.success
      ? parsed.data
      : DEFAULT_CONFIGURATION[field as keyof AppConfiguration]
  }
  return configurationSchema.parse({
    ...restored,
    minimizeToTrayOnClose:
      restored.showTrayIcon === true && restored.minimizeToTrayOnClose === true,
    startMinimized: restored.showTrayIcon === true && restored.startMinimized === true,
  })
}
