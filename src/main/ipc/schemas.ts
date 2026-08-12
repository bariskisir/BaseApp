/**
 * Validates every untrusted payload accepted by the IPC boundary.
 */

import { LOG_LEVELS } from '@shared/types'
import { z } from 'zod'

/** Maximum length accepted for a session title. */
export const MAX_SESSION_TITLE_LENGTH = 200

export const sessionIdSchema = z.uuid()

export const sessionRenameSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(MAX_SESSION_TITLE_LENGTH),
})

export const rendererLogSchema = z.object({
  level: z.enum(LOG_LEVELS),
  module: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(1_000),
  details: z.string().max(8_000).optional(),
})

export const alwaysOnTopSchema = z.boolean({ error: 'Invalid window preference.' })

export const resolvedThemeSchema = z.enum(['light', 'dark'], { error: 'Invalid theme.' })

export const externalUrlSchema = z.string({ error: 'Invalid external URL.' })
