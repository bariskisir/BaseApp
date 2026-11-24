import { clamp } from '@app/base/common/number'
import { z } from 'zod'
import {
  type DisplayWorkArea,
  type PersistedWindowState,
  type WindowBounds,
  viewLocationsSchema,
} from '../common/window'

const boundsSchema = z.object({
  x: z.number().int().min(-100_000).max(100_000),
  y: z.number().int().min(-100_000).max(100_000),
  width: z.number().int().min(1).max(100_000),
  height: z.number().int().min(1).max(100_000),
})

const persistedSidebarSchema = z.object({
  open: z.boolean(),
  width: z.number().min(1).max(100_000),
})

const persistedTertiaryBarSchema = z.object({
  open: z.boolean(),
  height: z.number().min(1).max(100_000),
})

const persistedWindowStateSchema = z.object({
  revision: z.literal(1),
  bounds: boundsSchema,
  maximized: z.boolean(),
  fullScreen: z.boolean(),
  sidebar: persistedSidebarSchema.optional(),
  auxiliaryBar: persistedSidebarSchema.optional(),
  tertiaryBar: persistedTertiaryBarSchema.optional(),
  compactMode: z.boolean().optional(),
  activeSessionId: z.uuid().optional(),
  viewLocations: viewLocationsSchema.optional(),
  activePrimaryViewId: z.string().min(1).max(128).optional(),
  activeAuxiliaryViewId: z.string().min(1).max(128).optional(),
  activeTertiaryViewId: z.string().min(1).max(128).optional(),
})

export function parsePersistedWindowState(input: unknown): PersistedWindowState | null {
  const parsed = persistedWindowStateSchema.safeParse(input)
  return parsed.success ? parsed.data : null
}

function intersectionArea(left: WindowBounds, right: DisplayWorkArea): number {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  )
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  )
  return width * height
}

export function fitWindowBoundsToDisplays(
  bounds: WindowBounds,
  workAreas: readonly DisplayWorkArea[],
): WindowBounds | null {
  let bestWorkArea: DisplayWorkArea | null = null
  let bestIntersection = 0

  for (const workArea of workAreas) {
    const area = intersectionArea(bounds, workArea)
    if (area <= bestIntersection) {
      continue
    }
    bestIntersection = area
    bestWorkArea = workArea
  }

  if (!bestWorkArea) {
    return null
  }

  const width = Math.min(bounds.width, bestWorkArea.width)
  const height = Math.min(bounds.height, bestWorkArea.height)
  return {
    x: clamp(bounds.x, bestWorkArea.x, bestWorkArea.x + bestWorkArea.width - width),
    y: clamp(bounds.y, bestWorkArea.y, bestWorkArea.y + bestWorkArea.height - height),
    width,
    height,
  }
}
