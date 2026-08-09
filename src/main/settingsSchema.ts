/**
 * Centralizes persisted and IPC settings validation for the reusable desktop shell.
 */

import {
  APP_LOCALES,
  DEFAULT_SETTINGS,
  LOG_LEVELS,
  NAVBAR_POSITIONS,
  PAGE_ZOOM_LIMITS,
  TIME_FORMATS,
  THEME_MODES,
  type AppSettings,
} from '@shared/types'
import { z } from 'zod'

const settingsFieldsSchema = z.object({
  settingsRevision: z.literal(1),
  uiLanguage: z.enum(APP_LOCALES),
  theme: z.enum(THEME_MODES),
  navbarPosition: z.enum(NAVBAR_POSITIONS),
  pageZoom: z.number().min(PAGE_ZOOM_LIMITS.min).max(PAGE_ZOOM_LIMITS.max),
  timeFormat: z.enum(TIME_FORMATS),
  alwaysOnTop: z.boolean(),
  showTrayIcon: z.boolean(),
  minimizeToTrayOnClose: z.boolean(),
  autoUpdate: z.boolean(),
  unattendedUpdates: z.boolean(),
  telemetryEnabled: z.boolean(),
  logLevel: z.enum(LOG_LEVELS),
})

/** Validates a complete persisted settings document and its cross-field tray invariant. */
export const settingsSchema = settingsFieldsSchema.superRefine((settings, context) => {
  if (settings.minimizeToTrayOnClose && !settings.showTrayIcon) {
    context.addIssue({
      code: 'custom',
      path: ['minimizeToTrayOnClose'],
      message: 'Minimize to tray requires the tray icon to be enabled.',
    })
  }
})

/** Validates a non-empty partial settings update received over IPC. */
export const settingsPatchSchema = settingsFieldsSchema
  .omit({ settingsRevision: true })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'At least one setting must be provided.')

/** Disables unsupported tray behavior without changing the persisted cross-platform preference. */
export const normalizeSettingsForPlatform = (
  settings: AppSettings,
  platform: NodeJS.Platform,
): AppSettings =>
  platform === 'linux'
    ? { ...settings, showTrayIcon: false, minimizeToTrayOnClose: false }
    : settings

/** Returns an object record only when a persisted value can contain named settings. */
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

/** Preserves individually valid shell preferences while discarding obsolete feature fields. */
export const parsePersistedSettings = (input: unknown): AppSettings => {
  const persisted = asRecord(input)
  if (!persisted) return structuredClone(DEFAULT_SETTINGS)

  /** Keeps a persisted enum-like value only when it belongs to the supported set. */
  const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback
  const showTrayIcon =
    typeof persisted.showTrayIcon === 'boolean'
      ? persisted.showTrayIcon
      : DEFAULT_SETTINGS.showTrayIcon
  const minimizeToTrayOnClose =
    showTrayIcon && typeof persisted.minimizeToTrayOnClose === 'boolean'
      ? persisted.minimizeToTrayOnClose
      : showTrayIcon && DEFAULT_SETTINGS.minimizeToTrayOnClose

  return settingsSchema.parse({
    settingsRevision: 1,
    uiLanguage: pick(persisted.uiLanguage, APP_LOCALES, DEFAULT_SETTINGS.uiLanguage),
    theme: pick(persisted.theme, THEME_MODES, DEFAULT_SETTINGS.theme),
    navbarPosition: pick(
      persisted.navbarPosition,
      NAVBAR_POSITIONS,
      DEFAULT_SETTINGS.navbarPosition,
    ),
    pageZoom:
      typeof persisted.pageZoom === 'number' &&
      persisted.pageZoom >= PAGE_ZOOM_LIMITS.min &&
      persisted.pageZoom <= PAGE_ZOOM_LIMITS.max
        ? persisted.pageZoom
        : DEFAULT_SETTINGS.pageZoom,
    timeFormat: pick(persisted.timeFormat, TIME_FORMATS, DEFAULT_SETTINGS.timeFormat),
    alwaysOnTop:
      typeof persisted.alwaysOnTop === 'boolean'
        ? persisted.alwaysOnTop
        : DEFAULT_SETTINGS.alwaysOnTop,
    showTrayIcon,
    minimizeToTrayOnClose,
    autoUpdate:
      typeof persisted.autoUpdate === 'boolean'
        ? persisted.autoUpdate
        : DEFAULT_SETTINGS.autoUpdate,
    unattendedUpdates:
      typeof persisted.unattendedUpdates === 'boolean'
        ? persisted.unattendedUpdates
        : DEFAULT_SETTINGS.unattendedUpdates,
    telemetryEnabled:
      typeof persisted.telemetryEnabled === 'boolean'
        ? persisted.telemetryEnabled
        : DEFAULT_SETTINGS.telemetryEnabled,
    logLevel: pick(persisted.logLevel, LOG_LEVELS, DEFAULT_SETTINGS.logLevel),
  })
}
