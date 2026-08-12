/**
 * Exposes a typed, capability-limited IPC API to the sandboxed renderer.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannel } from '@shared/IpcChannel'
import type {
  IpcEventChannel,
  IpcEventPayload,
  IpcInvokeArguments,
  IpcInvokeChannel,
  IpcResponse,
  IpcSendChannel,
  IpcSendPayload,
} from '@shared/ipcContract'
import type { AppApi, Unsubscribe } from '@shared/types'

/** Invokes one approved command and resolves with the value declared by its contract. */
const invoke = <Channel extends IpcInvokeChannel>(
  channel: Channel,
  ...request: IpcInvokeArguments<Channel>
): Promise<IpcResponse<Channel>> => ipcRenderer.invoke(channel, ...request)

/** Sends one approved message that the main process answers only through its own events. */
const send = <Channel extends IpcSendChannel>(
  channel: Channel,
  payload: IpcSendPayload<Channel>,
): void => {
  ipcRenderer.send(channel, payload)
}

/** Subscribes to one approved event and returns a cleanup callback. */
const subscribe = <Channel extends IpcEventChannel>(
  channel: Channel,
  listener: (payload: IpcEventPayload<Channel>) => void,
): Unsubscribe => {
  /** Drops Electron event metadata before forwarding the typed payload. */
  const handler = (_event: IpcRendererEvent, payload: IpcEventPayload<Channel>): void =>
    listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: AppApi = {
  /** Loads settings, generic sessions, and application metadata. */
  bootstrap: () => invoke(IpcChannel.AppBootstrap),
  /** Atomically merges validated application settings fields. */
  saveSettings: (patch) => invoke(IpcChannel.SettingsSave, patch),
  /** Creates one empty local session. */
  createSession: () => invoke(IpcChannel.SessionCreate),
  /** Loads one complete local session. */
  getSession: (id) => invoke(IpcChannel.SessionGet, id),
  /** Renames one local session. */
  renameSession: (id, title) => invoke(IpcChannel.SessionRename, { id, title }),
  /** Deletes one local session. */
  deleteSession: (id) => invoke(IpcChannel.SessionDelete, id),
  /** Deletes every local session and creates a fresh replacement. */
  deleteAllSessions: () => invoke(IpcChannel.SessionDeleteAll),
  /** Changes the native always-on-top window state. */
  setAlwaysOnTop: (enabled) => invoke(IpcChannel.WindowAlwaysOnTop, enabled),
  /** Minimizes the main application window. */
  minimizeWindow: () => invoke(IpcChannel.WindowMinimize),
  /** Toggles the main application window between maximized and restored states. */
  toggleMaximizeWindow: () => invoke(IpcChannel.WindowToggleMaximize),
  /** Closes the main application window. */
  closeWindow: () => invoke(IpcChannel.WindowClose),
  /** Retrieves the main application window's maximized state. */
  isWindowMaximized: () => invoke(IpcChannel.WindowIsMaximized),
  /** Synchronizes native title-bar colors with the renderer theme. */
  setTheme: (theme) => invoke(IpcChannel.ThemeSet, theme),
  /** Opens one allow-listed HTTPS URL in the system browser. */
  openExternal: (url) => invoke(IpcChannel.ShellOpenExternal, url),
  /** Opens the AppData log directory in the operating-system file manager. */
  openLogsDirectory: () => invoke(IpcChannel.LogsOpenDirectory),
  /** Forwards one renderer diagnostic to the configured main logger. */
  writeLog: (entry) => send(IpcChannel.LogWrite, entry),
  /** Checks GitHub Releases for a newer application version. */
  checkForUpdates: () => invoke(IpcChannel.UpdatesCheck),
  /** Restarts and installs a downloaded update. */
  installUpdate: () => invoke(IpcChannel.UpdatesInstall),
  /** Subscribes to updater lifecycle progress. */
  onUpdateState: (listener) => subscribe(IpcChannel.UpdateState, listener),
  /** Subscribes to maximize and restore state changes. */
  onWindowMaximizedChange: (listener) => subscribe(IpcChannel.WindowMaximizedChanged, listener),
  /** Subscribes to settings navigation requested by the tray menu. */
  onSettingsOpenRequested: (listener) => subscribe(IpcChannel.SettingsOpenRequested, listener),
}

contextBridge.exposeInMainWorld('app', api)
