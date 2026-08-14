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
  type DesktopPlatform,
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
  startMinimized: z.boolean(),
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
  if (settings.startMinimized && !settings.showTrayIcon) {
    context.addIssue({
      code: 'custom',
      path: ['startMinimized'],
      message: 'Starting minimized requires the tray icon to be enabled.',
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
  platform: DesktopPlatform,
): AppSettings =>
  platform === 'linux'
    ? {
        ...settings,
        showTrayIcon: false,
        minimizeToTrayOnClose: false,
        startMinimized: false,
      }
    : settings

/** Returns named settings only when the persisted document can contain them. */
const asSettingsRecord = (input: unknown): Record<string, unknown> =>
  input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {}

/**
 * Restores every individually valid shell preference, falls back per field for obsolete or
 * corrupted values, and drops fields that the current shell no longer owns.
 */
export const parsePersistedSettings = (input: unknown): AppSettings => {
  const persisted = asSettingsRecord(input)
  const restored: Record<string, unknown> = {}
  for (const [field, fieldSchema] of Object.entries(settingsFieldsSchema.shape)) {
    const parsed = fieldSchema.safeParse(persisted[field])
    restored[field] = parsed.success ? parsed.data : DEFAULT_SETTINGS[field as keyof AppSettings]
  }
  return settingsSchema.parse({
    ...restored,
    minimizeToTrayOnClose:
      restored.showTrayIcon === true && restored.minimizeToTrayOnClose === true,
    startMinimized: restored.showTrayIcon === true && restored.startMinimized === true,
  })
}
