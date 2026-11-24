pub mod parts;
pub mod state;

pub use parts::{
    DraggedView, OpenDialogHandler, OverlayState, SessionsView, SettingsEditorView, WorkbenchView,
};
pub use state::{
    CloseSettingsTab, CycleTheme, DismissOverlay, LayoutState, MAX_VISIBLE_NOTIFICATIONS,
    NewSession, NotificationItem, NotificationSeverity, NotificationStore, OpenSettings, Relaunch,
    ResetLayout, SESSIONS_VIEW_ID, SettingsCategoryId, ToggleAlwaysOnTop, ToggleAuxiliaryBar,
    ToggleCompactMode, ToggleFullScreen, ToggleSideBarPosition, ToggleSidebar, ToggleStatusBar,
    ToggleTertiaryBar, ViewDescriptor, ViewDescriptorState, WorkbenchEvent, WorkbenchPage,
    WorkbenchServices, WorkbenchState, ZoomIn, ZoomOut, ZoomReset, matches_settings_query,
    register_workbench_keybindings,
};

pub fn workbench_version() -> &'static str {
    baseapp_ui::ui_version()
}

#[cfg(test)]
mod tests {
    use super::workbench_version;

    #[test]
    fn links_ui_layer() {
        assert_eq!(workbench_version(), "3.0.0");
    }
}
