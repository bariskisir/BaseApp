/**
 * Tracks and persists the durable position, size, display mode, and session sidebar
 * preferences of the main window.
 */

import type { BrowserWindow } from 'electron'
import type { SidebarState } from '@shared/types'
import { readJsonFile, writeJsonFileSync } from '../storage/atomicJson'
import {
  fitWindowBoundsToDisplays,
  parsePersistedWindowState,
  type PersistedSidebarState,
  type PersistedWindowState,
  type WindowBounds,
} from '../windowState'
import type LoggerService from './LoggerService'

const SAVE_DEBOUNCE_MS = 250

/** Window placement and sidebar preferences restored from an earlier session. */
export interface RestoredWindowState {
  bounds: WindowBounds | null
  maximized: boolean
  fullScreen: boolean
  sidebar: PersistedSidebarState | null
  compactMode: boolean | null
}

/** Owns the small window-state document and the events that keep it current. */
export default class WindowStateStore {
  private state: PersistedWindowState | null = null
  private window: BrowserWindow | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private logger: LoggerService | null = null

  /** Creates a store for one durable window-state document. */
  public constructor(private readonly filePath: string) {}

  /**
   * Loads the last valid window state and keeps only bounds that still fit a connected
   * display, so stale coordinates cannot open the window off-screen.
   */
  public async load(workAreas: WindowBounds[]): Promise<RestoredWindowState | null> {
    let persisted: PersistedWindowState | null = null
    try {
      persisted = parsePersistedWindowState(await readJsonFile(this.filePath))
    } catch {
      persisted = null
    }
    if (!persisted) return null
    return {
      bounds: fitWindowBoundsToDisplays(persisted.bounds, workAreas),
      maximized: persisted.maximized,
      fullScreen: persisted.fullScreen,
      sidebar: persisted.sidebar ?? null,
      compactMode: persisted.compactMode ?? null,
    }
  }

  /** Reports the persisted sidebar state for renderer bootstrap, or null before the first report. */
  public getSidebarState(): SidebarState | null {
    const sidebar = this.state?.sidebar
    if (!sidebar) return null
    return {
      open: sidebar.open,
      width: sidebar.width,
      compact: this.state?.compactMode ?? false,
    }
  }

  /** Merges the session sidebar state chosen by the renderer and schedules one atomic save. */
  public setSidebarState(state: SidebarState): void {
    if (!this.state) return
    this.state = {
      ...this.state,
      sidebar: { open: state.open, width: state.width },
      compactMode: state.compact,
    }
    this.scheduleSave()
  }

  /** Records normal bounds, display mode, and sidebar preferences for later launches. */
  public track(
    window: BrowserWindow,
    restored: RestoredWindowState | null,
    logger: LoggerService,
  ): void {
    this.logger = logger
    this.window = window
    this.state = {
      revision: 1,
      bounds: restored?.bounds ?? window.getBounds(),
      maximized: restored?.maximized ?? false,
      fullScreen: restored?.fullScreen ?? false,
      sidebar: restored?.sidebar ?? undefined,
      compactMode: restored?.compactMode ?? undefined,
    }

    window.on('move', () => this.scheduleSave())
    window.on('resize', () => this.scheduleSave())
    window.on('maximize', () => this.scheduleSave())
    window.on('unmaximize', () => this.scheduleSave())
    window.on('enter-full-screen', () => this.scheduleSave())
    window.on('leave-full-screen', () => this.scheduleSave())
    window.on('close', () => {
      this.cancelScheduledSave()
      this.capture()
      this.persist()
    })
    window.once('closed', () => {
      this.cancelScheduledSave()
      if (this.window === window) this.window = null
    })
  }

  /** Debounces frequent window and sidebar changes before saving the latest state. */
  private scheduleSave(): void {
    this.capture()
    this.cancelScheduledSave()
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.capture()
      this.persist()
    }, SAVE_DEBOUNCE_MS)
  }

  /** Stops a pending debounced save so a closing window cannot write twice. */
  private cancelScheduledSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
  }

  /** Captures normal bounds while retaining them and sidebar state when maximized or fullscreen. */
  private capture(): void {
    const window = this.window
    if (!window || window.isDestroyed()) return
    const maximized = window.isMaximized()
    const fullScreen = window.isFullScreen()
    const bounds =
      maximized || fullScreen
        ? (this.state?.bounds ?? window.getNormalBounds())
        : window.getBounds()
    this.state = {
      revision: 1,
      bounds,
      maximized,
      fullScreen,
      sidebar: this.state?.sidebar,
      compactMode: this.state?.compactMode,
    }
  }

  /** Writes the latest state atomically so a close event cannot lose the last move. */
  private persist(): void {
    if (!this.state) return
    try {
      writeJsonFileSync(this.filePath, this.state)
    } catch (error) {
      this.logger?.warn('WindowStateStore', 'Window state could not be persisted.', error)
    }
  }
}
