/**
 * Enumerates every IPC channel exposed by the desktop application.
 */

/** Approved command and event names shared by the main and renderer processes. */
export enum IpcChannel {
  AppBootstrap = 'app:bootstrap',
  SettingsSave = 'settings:save',
  SessionGet = 'session:get',
  SessionCreate = 'session:create',
  SessionRename = 'session:rename',
  SessionDelete = 'session:delete',
  SessionDeleteAll = 'session:delete-all',
  WindowAlwaysOnTop = 'window:always-on-top',
  WindowMinimize = 'window:minimize',
  WindowToggleMaximize = 'window:toggle-maximize',
  WindowClose = 'window:close',
  WindowIsMaximized = 'window:is-maximized',
  ThemeSet = 'theme:set',
  ShellOpenExternal = 'shell:open-external',
  LogsOpenDirectory = 'logs:open-directory',
  LogWrite = 'logs:write',
  UpdatesCheck = 'updates:check',
  UpdatesInstall = 'updates:install',
  UpdateState = 'event:update-state',
  WindowMaximizedChanged = 'event:window-maximized-changed',
  SettingsOpenRequested = 'event:settings-open-requested',
}
