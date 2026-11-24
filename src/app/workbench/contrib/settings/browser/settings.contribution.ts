import { CommandsRegistry } from '@app/platform/commands/common/commands'
import { createAboutSettingsView } from '@app/workbench/browser/parts/editor/settingsViews/aboutSettingsView'
import { createAppearanceSettingsView } from '@app/workbench/browser/parts/editor/settingsViews/appearanceSettingsView'
import { createGeneralSettingsView } from '@app/workbench/browser/parts/editor/settingsViews/generalSettingsView'
import { createPrivacyDataSettingsView } from '@app/workbench/browser/parts/editor/settingsViews/privacyDataSettingsView'
import { createSystemSettingsView } from '@app/workbench/browser/parts/editor/settingsViews/systemSettingsView'
import { createTraySettingsView } from '@app/workbench/browser/parts/editor/settingsViews/traySettingsView'
import { createUpdatesSettingsView } from '@app/workbench/browser/parts/editor/settingsViews/updatesSettingsView'
import { registerSettingsCategory } from '@app/workbench/common/settingsRegistry'
import { IWorkbenchLayoutService } from '@app/workbench/services/layout/browser/layoutService'

export const SETTINGS_COMMANDS = {
  toggle: 'settings.toggle',
  open: 'settings.open',
} as const

registerSettingsCategory({
  id: 'general',
  titleKey: 'settings.general',
  iconId: 'settings-gear',
  order: 10,
  component: () => createGeneralSettingsView,
})

registerSettingsCategory({
  id: 'appearance',
  titleKey: 'settings.appearance',
  iconId: 'color-mode',
  order: 20,
  component: () => createAppearanceSettingsView,
})

registerSettingsCategory({
  id: 'tray',
  titleKey: 'settings.trayAndTaskbar',
  iconId: 'panel-bottom',
  order: 30,
  component: () => createTraySettingsView,
})

registerSettingsCategory({
  id: 'privacy',
  titleKey: 'settings.privacyAndData',
  iconId: 'shield',
  order: 40,
  component: () => createPrivacyDataSettingsView,
})

registerSettingsCategory({
  id: 'system',
  titleKey: 'settings.system',
  iconId: 'cpu',
  order: 50,
  component: () => createSystemSettingsView,
})

registerSettingsCategory({
  id: 'updates',
  titleKey: 'settings.updates',
  iconId: 'refresh',
  order: 60,
  component: () => createUpdatesSettingsView,
})

registerSettingsCategory({
  id: 'about',
  titleKey: 'settings.about',
  iconId: 'info',
  order: 70,
  component: () => createAboutSettingsView,
})

CommandsRegistry.registerCommand(SETTINGS_COMMANDS.toggle, (accessor) => {
  accessor.get(IWorkbenchLayoutService).toggleSettings()
})

CommandsRegistry.registerCommand(SETTINGS_COMMANDS.open, (accessor, section?: unknown) => {
  accessor
    .get(IWorkbenchLayoutService)
    .openSettings(typeof section === 'string' ? section : undefined)
})
