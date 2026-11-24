import { addDisposableListener } from '@app/base/browser/dom'
import { Disposable } from '@app/base/common/lifecycle'
import { CommandsRegistry, ICommandService } from '@app/platform/commands/common/commands'
import {
  DEFAULT_ZOOM_LEVEL,
  THEME_MODES,
  type ThemeMode,
  ZOOM_LEVEL_STEP,
  clampZoomLevel,
} from '@app/platform/configuration/common/configuration'
import { ILogService } from '@app/platform/log/common/log'
import { INativeHostService } from '@app/platform/native/common/native'
import { applyZoom } from '@app/platform/window/electron-browser/window'
import {
  type IWorkbenchContribution,
  WorkbenchPhase,
  registerWorkbenchContribution,
} from '@app/workbench/common/contributions'
import { IWorkbenchConfigurationService } from '@app/workbench/services/configuration/browser/workbenchConfigurationService'
import { IWorkbenchLayoutService } from '@app/workbench/services/layout/browser/layoutService'
import { IWorkbenchLocalizationService } from '@app/workbench/services/localization/browser/localizationService'
import { INotificationService } from '@app/workbench/services/notification/browser/notificationService'

export const WINDOW_COMMANDS = {
  toggleAlwaysOnTop: 'window.toggleAlwaysOnTop',
  cycleTheme: 'window.cycleTheme',
  toggleSidebar: 'window.toggleSidebar',
  toggleAuxiliaryBar: 'window.toggleAuxiliaryBar',
  toggleTertiaryBar: 'window.toggleTertiaryBar',
  toggleSideBarPosition: 'window.toggleSideBarPosition',
  toggleStatusBar: 'window.toggleStatusBar',
  toggleCompactMode: 'window.toggleCompactMode',
  toggleFullScreen: 'window.toggleFullScreen',
  zoomIn: 'window.zoomIn',
  zoomOut: 'window.zoomOut',
  zoomReset: 'window.zoomReset',
  resetLayout: 'window.resetLayout',
  relaunch: 'app.relaunch',
} as const

export const WINDOW_CONTRIBUTION_ID = 'workbench.contrib.window'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') {
    return false
  }
  const element = target as { tagName?: string; isContentEditable?: boolean }
  if (element.isContentEditable) {
    return true
  }
  const tag = element.tagName?.toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export class WindowWorkbenchContribution extends Disposable implements IWorkbenchContribution {
  constructor(
    @IWorkbenchConfigurationService
    private readonly configurationService: IWorkbenchConfigurationService,
    @IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
    @INativeHostService private readonly nativeHostService: INativeHostService,
    @ICommandService private readonly commandService: ICommandService,
  ) {
    super()

    applyZoom(this.configurationService.getValue('zoomLevel'))

    this._register(
      this.configurationService.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('zoomLevel')) {
          applyZoom(event.configuration.zoomLevel)
        }
      }),
    )

    this._register(
      this.nativeHostService.onDidChangeWindowMaximized((maximized) => {
        this.layoutService.setMaximized(maximized)
      }),
    )

    if (typeof this.nativeHostService.onDidChangeWindowFullScreen === 'function') {
      this._register(
        this.nativeHostService.onDidChangeWindowFullScreen((fullScreen) => {
          this.layoutService.setFullScreen(fullScreen)
        }),
      )
    }

    this._register(
      this.nativeHostService.onDidRequestOpenSettings(() => {
        this.layoutService.openSettings()
      }),
    )

    this.registerKeyboardShortcuts()
  }

  private registerKeyboardShortcuts(): void {
    if (typeof window === 'undefined') {
      return
    }
    this._register(
      addDisposableListener(window, 'keydown', (event) => {
        const isMac = this.configurationService.platform === 'darwin'
        const primaryMod = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey

        if (!isMac && event.key === 'F11' && !event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault()
          void this.commandService.executeCommand(WINDOW_COMMANDS.toggleFullScreen)
          return
        }

        if (isMac && event.metaKey && event.ctrlKey && event.key.toLowerCase() === 'f') {
          event.preventDefault()
          void this.commandService.executeCommand(WINDOW_COMMANDS.toggleFullScreen)
          return
        }

        if (!primaryMod) {
          return
        }

        if (event.key === ',' && !event.shiftKey && !event.altKey) {
          event.preventDefault()
          this.layoutService.openSettings()
          return
        }

        if (
          (event.key === '=' || event.key === '+' || event.code === 'NumpadAdd') &&
          !event.altKey
        ) {
          event.preventDefault()
          void this.commandService.executeCommand(WINDOW_COMMANDS.zoomIn)
          return
        }

        if ((event.key === '-' || event.code === 'NumpadSubtract') && !event.altKey) {
          event.preventDefault()
          void this.commandService.executeCommand(WINDOW_COMMANDS.zoomOut)
          return
        }

        if ((event.key === '0' || event.code === 'Numpad0') && !event.altKey && !event.shiftKey) {
          event.preventDefault()
          void this.commandService.executeCommand(WINDOW_COMMANDS.zoomReset)
          return
        }

        if (isEditableTarget(event.target)) {
          return
        }

        if (event.key.toLowerCase() === 'b' && !event.shiftKey) {
          event.preventDefault()
          if (event.altKey) {
            void this.commandService.executeCommand(WINDOW_COMMANDS.toggleAuxiliaryBar)
          } else {
            void this.commandService.executeCommand(WINDOW_COMMANDS.toggleSidebar)
          }
          return
        }

        if (event.key.toLowerCase() === 'j' && !event.shiftKey && !event.altKey) {
          event.preventDefault()
          void this.commandService.executeCommand(WINDOW_COMMANDS.toggleTertiaryBar)
        }
      }),
    )
  }
}

CommandsRegistry.registerCommand(WINDOW_COMMANDS.toggleAlwaysOnTop, async (accessor) => {
  const configurationService = accessor.get(IWorkbenchConfigurationService)
  const current = configurationService.getValue('alwaysOnTop')
  return configurationService.updateConfiguration({ alwaysOnTop: !current })
})

CommandsRegistry.registerCommand(WINDOW_COMMANDS.cycleTheme, async (accessor) => {
  const configurationService = accessor.get(IWorkbenchConfigurationService)
  const current = configurationService.getValue('theme')
  const index = THEME_MODES.indexOf(current)
  const nextTheme: ThemeMode = THEME_MODES[(index + 1) % THEME_MODES.length] ?? 'system'
  return configurationService.updateConfiguration({ theme: nextTheme })
})

CommandsRegistry.registerCommand(WINDOW_COMMANDS.toggleSidebar, (accessor) => {
  accessor.get(IWorkbenchLayoutService).toggleSidebar()
})

CommandsRegistry.registerCommand(WINDOW_COMMANDS.toggleAuxiliaryBar, (accessor) => {
  accessor.get(IWorkbenchLayoutService).toggleAuxiliaryBar()
})

CommandsRegistry.registerCommand(WINDOW_COMMANDS.toggleTertiaryBar, (accessor) => {
  accessor.get(IWorkbenchLayoutService).toggleTertiaryBar()
})

CommandsRegistry.registerCommand(WINDOW_COMMANDS.toggleSideBarPosition, (accessor) =>
  accessor.get(IWorkbenchLayoutService).toggleSideBarPosition(),
)

CommandsRegistry.registerCommand(WINDOW_COMMANDS.toggleStatusBar, (accessor) =>
  accessor.get(IWorkbenchLayoutService).toggleStatusBarVisible(),
)

CommandsRegistry.registerCommand(WINDOW_COMMANDS.toggleCompactMode, (accessor) => {
  accessor.get(IWorkbenchLayoutService).toggleCompactMode()
})

CommandsRegistry.registerCommand(WINDOW_COMMANDS.toggleFullScreen, (accessor) =>
  accessor.get(IWorkbenchLayoutService).toggleFullScreen(),
)

CommandsRegistry.registerCommand(WINDOW_COMMANDS.zoomIn, async (accessor) => {
  const configurationService = accessor.get(IWorkbenchConfigurationService)
  const current = configurationService.getValue('zoomLevel')
  const next = clampZoomLevel(Math.round(current) + ZOOM_LEVEL_STEP)
  if (next === current) {
    return configurationService.getConfiguration()
  }
  return configurationService.updateConfiguration({ zoomLevel: next })
})

CommandsRegistry.registerCommand(WINDOW_COMMANDS.zoomOut, async (accessor) => {
  const configurationService = accessor.get(IWorkbenchConfigurationService)
  const current = configurationService.getValue('zoomLevel')
  const next = clampZoomLevel(Math.round(current) - ZOOM_LEVEL_STEP)
  if (next === current) {
    return configurationService.getConfiguration()
  }
  return configurationService.updateConfiguration({ zoomLevel: next })
})

CommandsRegistry.registerCommand(WINDOW_COMMANDS.zoomReset, async (accessor) => {
  const configurationService = accessor.get(IWorkbenchConfigurationService)
  return configurationService.updateConfiguration({ zoomLevel: DEFAULT_ZOOM_LEVEL })
})

CommandsRegistry.registerCommand(WINDOW_COMMANDS.resetLayout, (accessor) =>
  accessor.get(IWorkbenchLayoutService).resetLayout(),
)

CommandsRegistry.registerCommand(WINDOW_COMMANDS.relaunch, async (accessor) => {
  const nativeHostService = accessor.get(INativeHostService)
  const logService = accessor.get(ILogService)
  const notificationService = accessor.get(INotificationService)
  const localizationService = accessor.get(IWorkbenchLocalizationService)
  try {
    await nativeHostService.relaunch()
  } catch (error) {
    logService.error('WindowContribution', 'Application could not be restarted.', error)
    notificationService.error(localizationService.t('errors.generic'))
  }
})

registerWorkbenchContribution(
  WINDOW_CONTRIBUTION_ID,
  WindowWorkbenchContribution,
  WorkbenchPhase.BlockRestore,
)
