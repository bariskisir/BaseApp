import { clamp } from '@app/base/common/number'
import { z } from 'zod'

export const MIN_ZOOM_LEVEL = -8
export const MAX_ZOOM_LEVEL = 8
export const DEFAULT_ZOOM_LEVEL = 0
export const ZOOM_LEVEL_STEP = 1

export function zoomLevelToZoomFactor(zoomLevel = DEFAULT_ZOOM_LEVEL): number {
  return 1.2 ** zoomLevel
}

export function clampZoomLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return DEFAULT_ZOOM_LEVEL
  }
  const rounded = Math.round(level * 10) / 10
  return clamp(rounded, MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL)
}

export function zoomFactorToZoomLevel(zoomFactor = 1): number {
  if (!Number.isFinite(zoomFactor) || zoomFactor <= 0) {
    return DEFAULT_ZOOM_LEVEL
  }
  return clampZoomLevel(Math.round(Math.log(zoomFactor) / Math.log(1.2)))
}

export const VIEW_CONTAINER_LOCATIONS = ['sidebar', 'auxiliarybar', 'tertiarybar'] as const
export type ViewContainerLocation = (typeof VIEW_CONTAINER_LOCATIONS)[number]

export const SIDEBAR_POSITIONS = ['left', 'right'] as const
export type SideBarPosition = (typeof SIDEBAR_POSITIONS)[number]

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface DisplayWorkArea {
  x: number
  y: number
  width: number
  height: number
}

export interface PersistedSidebarState {
  open: boolean
  width: number
}

export interface PersistedTertiaryBarState {
  open: boolean
  height: number
}

export interface SidebarState {
  open: boolean
  width: number
  compact: boolean
  auxiliaryOpen?: boolean | undefined
  auxiliaryWidth?: number | undefined
  tertiaryOpen?: boolean | undefined
  tertiaryHeight?: number | undefined
  viewLocations?: Record<string, ViewContainerLocation> | undefined
  activePrimaryViewId?: string | undefined
  activeAuxiliaryViewId?: string | undefined
  activeTertiaryViewId?: string | undefined
}

export interface PersistedWindowState {
  revision: 1
  bounds: WindowBounds
  maximized: boolean
  fullScreen: boolean
  sidebar?: PersistedSidebarState | undefined
  auxiliaryBar?: PersistedSidebarState | undefined
  tertiaryBar?: PersistedTertiaryBarState | undefined
  compactMode?: boolean | undefined
  activeSessionId?: string | undefined
  viewLocations?: Record<string, ViewContainerLocation> | undefined
  activePrimaryViewId?: string | undefined
  activeAuxiliaryViewId?: string | undefined
  activeTertiaryViewId?: string | undefined
}

export const DEFAULT_WINDOW_SIZE = { width: 1180, height: 760 } as const

export const SIDEBAR_LIMITS = {
  min: 170,
  default: 170,
  minWorkspace: 360,
} as const

export const TERTIARY_BAR_LIMITS = {
  min: 120,
  default: 120,
  minWorkspace: 220,
} as const

export const DEFAULT_AUXILIARY_BAR_STATE: PersistedSidebarState = {
  open: false,
  width: SIDEBAR_LIMITS.default,
}

export const DEFAULT_TERTIARY_BAR_STATE: PersistedTertiaryBarState = {
  open: false,
  height: TERTIARY_BAR_LIMITS.default,
}

export const DEFAULT_SIDEBAR_STATE: SidebarState = {
  open: true,
  width: SIDEBAR_LIMITS.default,
  compact: false,
  auxiliaryOpen: DEFAULT_AUXILIARY_BAR_STATE.open,
  auxiliaryWidth: DEFAULT_AUXILIARY_BAR_STATE.width,
  tertiaryOpen: DEFAULT_TERTIARY_BAR_STATE.open,
  tertiaryHeight: DEFAULT_TERTIARY_BAR_STATE.height,
}

export function getMaxSidebarWidth(viewportWidth: number, otherSidebarWidth = 0): number {
  const safeViewportWidth = Number.isFinite(viewportWidth)
    ? Math.max(0, Math.floor(viewportWidth))
    : SIDEBAR_LIMITS.default + SIDEBAR_LIMITS.minWorkspace
  const safeOtherWidth = Number.isFinite(otherSidebarWidth)
    ? Math.max(0, Math.floor(otherSidebarWidth))
    : 0
  return Math.max(
    SIDEBAR_LIMITS.min,
    safeViewportWidth - SIDEBAR_LIMITS.minWorkspace - safeOtherWidth,
  )
}

export function clampSidebarWidth(
  width: number,
  viewportWidth: number,
  otherSidebarWidth = 0,
): number {
  const normalizedWidth = Number.isFinite(width) ? Math.round(width) : SIDEBAR_LIMITS.default
  return clamp(
    normalizedWidth,
    SIDEBAR_LIMITS.min,
    getMaxSidebarWidth(viewportWidth, otherSidebarWidth),
  )
}

export function getMaxTertiaryBarHeight(viewportHeight: number): number {
  const safeViewportHeight = Number.isFinite(viewportHeight)
    ? Math.max(0, Math.floor(viewportHeight))
    : TERTIARY_BAR_LIMITS.default + TERTIARY_BAR_LIMITS.minWorkspace
  return Math.max(TERTIARY_BAR_LIMITS.min, safeViewportHeight - TERTIARY_BAR_LIMITS.minWorkspace)
}

export function clampTertiaryBarHeight(height: number, viewportHeight: number): number {
  const normalizedHeight = Number.isFinite(height)
    ? Math.round(height)
    : TERTIARY_BAR_LIMITS.default
  return clamp(normalizedHeight, TERTIARY_BAR_LIMITS.min, getMaxTertiaryBarHeight(viewportHeight))
}

export const viewContainerLocationSchema = z.enum(VIEW_CONTAINER_LOCATIONS)

export const viewLocationsSchema = z.record(z.string().min(1).max(128), viewContainerLocationSchema)

export const sidebarStateSchema = z.object({
  open: z.boolean({ error: 'Invalid sidebar visibility.' }),
  width: z.number({ error: 'Invalid sidebar width.' }).min(1).max(100_000),
  compact: z.boolean({ error: 'Invalid compact mode.' }),
  auxiliaryOpen: z.boolean({ error: 'Invalid secondary sidebar visibility.' }).optional(),
  auxiliaryWidth: z
    .number({ error: 'Invalid secondary sidebar width.' })
    .min(1)
    .max(100_000)
    .optional(),
  tertiaryOpen: z.boolean({ error: 'Invalid tertiary sidebar visibility.' }).optional(),
  tertiaryHeight: z
    .number({ error: 'Invalid tertiary sidebar height.' })
    .min(1)
    .max(100_000)
    .optional(),
  viewLocations: viewLocationsSchema.optional(),
  activePrimaryViewId: z.string().min(1).max(128).optional(),
  activeAuxiliaryViewId: z.string().min(1).max(128).optional(),
  activeTertiaryViewId: z.string().min(1).max(128).optional(),
})
