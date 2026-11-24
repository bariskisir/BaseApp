use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::sync::{Arc, Mutex};

use baseapp_base::DesktopPlatform;
use baseapp_platform::{
    AppConfigurationPatch, DEFAULT_GPUI_VERSION, EnvironmentPaths, NativeError, NativeHost,
    ProductInfo, ResolvedThemeMode, RuntimeInfo, SIDEBAR_DEFAULT_WIDTH, SideBarPosition,
    TERTIARY_DEFAULT_HEIGHT, ThemeMode, UpdateState, UpdateStateEvent, ViewContainerLocation,
    platform_os_label, platform_renderer_name,
};
use baseapp_ui::{
    ActiveTheme, BaseAppAssets, Codicon, ConfirmDialogModel, ContextMenuEntry, ContextMenuModel,
    DialogModel, InputBoxState, PromptDialogModel, register_input_keybindings, scaled_rem_size,
};
use baseapp_workbench::{
    CloseSettingsTab, CycleTheme, DismissOverlay, NewSession, OpenSettings, ResetLayout,
    SESSIONS_VIEW_ID, SettingsCategoryId, ToggleAuxiliaryBar, ToggleCompactMode,
    ToggleSideBarPosition, ToggleSidebar, ToggleStatusBar, ToggleTertiaryBar, WorkbenchPage,
    WorkbenchServices, WorkbenchState, WorkbenchView, ZoomIn, ZoomOut, ZoomReset,
    register_workbench_keybindings,
};
use gpui::{
    AnyWindowHandle, AppContext as _, AssetSource as _, AvailableSpace, Entity, TestAppContext,
    WindowHandle, point, prelude::*, px, size,
};
use raw_window_handle::RawWindowHandle;
use tempfile::TempDir;

struct TestNativeHost {
    platform: DesktopPlatform,
    version: String,
    opened_urls: Mutex<Vec<String>>,
}

impl TestNativeHost {
    fn new(platform: DesktopPlatform) -> Self {
        Self {
            platform,
            version: "3.0.0".to_string(),
            opened_urls: Mutex::new(Vec::new()),
        }
    }
}

impl NativeHost for TestNativeHost {
    fn platform(&self) -> DesktopPlatform {
        self.platform
    }

    fn version(&self) -> &str {
        &self.version
    }

    fn runtime_info(&self) -> RuntimeInfo {
        RuntimeInfo {
            app_version: self.version.clone(),
            rust_version: "1.99.1".to_string(),
            gpui_version: DEFAULT_GPUI_VERSION.to_string(),
            renderer: platform_renderer_name(self.platform).to_string(),
            os: platform_os_label(self.platform),
            arch: std::env::consts::ARCH.to_string(),
            platform: self.platform,
        }
    }

    fn open_external_url(&self, raw_url: &str) -> Result<(), NativeError> {
        let mut guard = match self.opened_urls.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        guard.push(raw_url.to_string());
        Ok(())
    }

    fn open_directory(&self, _path: &Path) -> Result<(), NativeError> {
        Ok(())
    }

    fn pick_export_settings_path(&self, _default_file_name: &str) -> Option<PathBuf> {
        None
    }

    fn pick_import_settings_path(&self) -> Option<PathBuf> {
        None
    }

    fn set_launch_at_startup(&self, _enabled: bool) -> Result<(), NativeError> {
        Ok(())
    }

    fn is_launch_at_startup_enabled(&self) -> Result<bool, NativeError> {
        Ok(false)
    }

    fn apply_always_on_top(
        &self,
        _handle: RawWindowHandle,
        _always_on_top: bool,
    ) -> Result<(), NativeError> {
        Ok(())
    }

    fn apply_window_opacity(
        &self,
        _handle: RawWindowHandle,
        opacity: f64,
    ) -> Result<f64, NativeError> {
        Ok(opacity)
    }

    fn apply_content_protection(
        &self,
        _handle: RawWindowHandle,
        _enabled: bool,
    ) -> Result<(), NativeError> {
        Ok(())
    }

    fn apply_show_in_taskbar(
        &self,
        _handle: RawWindowHandle,
        _show: bool,
    ) -> Result<(), NativeError> {
        Ok(())
    }
}

fn try_create_workbench(
    cx: &mut TestAppContext,
    root: &Path,
    platform: DesktopPlatform,
    system_is_dark: bool,
) -> Result<
    (WindowHandle<WorkbenchView>, Entity<WorkbenchState>),
    baseapp_platform::ConfigurationError,
> {
    cx.update(|cx| {
        register_input_keybindings(cx);
        register_workbench_keybindings(cx);
    });

    let paths = EnvironmentPaths::from_root(root.to_path_buf(), platform);
    let host: Arc<dyn NativeHost> = Arc::new(TestNativeHost::new(platform));
    let services = WorkbenchServices::from_environment(paths, ProductInfo::default(), host)?;
    let state = cx.new(|_| WorkbenchState::initialize(services, system_is_dark));
    let state_for_window = state.clone();
    let window = cx.add_window(|window, cx| WorkbenchView::new(state_for_window, window, cx));
    cx.run_until_parked();
    Ok((window, state))
}

fn draw_window(cx: &mut TestAppContext, window: AnyWindowHandle) {
    let _ = cx.update_window(window, |_, window, cx| {
        window.draw(cx).clear(cx);
    });
    cx.run_until_parked();
}

#[gpui::test]
fn workbench_renders_home_welcome_sidebar_titlebar_and_statusbar_in_dark_and_light(
    cx: &mut TestAppContext,
) {
    assert!(BaseAppAssets.load("brand/icon.png").unwrap().is_some());
    assert!(
        BaseAppAssets
            .load(Codicon::SettingsGear.asset_path())
            .unwrap()
            .is_some()
    );

    let temp = TempDir::new().unwrap();
    let (window, state) =
        try_create_workbench(cx, temp.path(), DesktopPlatform::Win32, true).unwrap();
    let any_window: AnyWindowHandle = window.into();

    draw_window(cx, any_window);

    cx.read(|cx| {
        assert_eq!(ActiveTheme::current(cx).mode, ResolvedThemeMode::Dark);
    });
    state.read_with(cx, |s, _| {
        assert_eq!(s.layout().page, WorkbenchPage::Home);
        assert!(s.layout().sidebar_open);
        assert!(s.layout().status_bar_visible);
        assert_eq!(s.sessions().len(), 1);
    });

    cx.dispatch_action(any_window, NewSession);
    state.update(cx, |s, cx| {
        let first_id = s.sessions()[0].id.clone();
        assert!(s.toggle_session_pinned(&first_id, true, cx));
        s.set_update_state(
            UpdateStateEvent {
                state: UpdateState::Available,
                version: Some("4.0.0".to_string()),
                percent: None,
                release_notes: Some("Notes".to_string()),
                message: None,
                page_url: Some("https://github.com/bariskisir/BaseApp/releases".to_string()),
            },
            cx,
        );
        s.notify_info("Welcome to BaseApp", cx);
    });
    draw_window(cx, any_window);

    cx.dispatch_action(any_window, CycleTheme);
    draw_window(cx, any_window);
    cx.read(|cx| {
        assert_eq!(ActiveTheme::current(cx).mode, ResolvedThemeMode::Light);
    });
    assert_eq!(
        state.read_with(cx, |s, _| s.config().theme),
        ThemeMode::Light
    );

    cx.dispatch_action(any_window, ToggleCompactMode);
    draw_window(cx, any_window);
    assert!(state.read_with(cx, |s, _| s.layout().compact_mode));

    cx.dispatch_action(any_window, ToggleCompactMode);
    draw_window(cx, any_window);
    assert!(!state.read_with(cx, |s, _| s.layout().compact_mode));
}

#[gpui::test]
fn workbench_settings_opens_renders_all_seven_categories_searches_and_closes(
    cx: &mut TestAppContext,
) {
    let temp = TempDir::new().unwrap();
    let (window, state) =
        try_create_workbench(cx, temp.path(), DesktopPlatform::Win32, true).unwrap();
    let any_window: AnyWindowHandle = window.into();

    assert!(
        window
            .read_with(cx, |view, _| view.settings_view().is_none())
            .unwrap()
    );

    cx.dispatch_action(any_window, OpenSettings);
    draw_window(cx, any_window);

    assert_eq!(
        state.read_with(cx, |s, _| s.layout().page),
        WorkbenchPage::Settings
    );
    assert!(state.read_with(cx, |s, _| s.layout().settings_tab_open));
    assert!(
        window
            .read_with(cx, |view, _| view.settings_view().is_some())
            .unwrap()
    );

    for &category in SettingsCategoryId::ALL {
        state.update(cx, |s, cx| s.set_settings_section(category, cx));
        draw_window(cx, any_window);
        assert_eq!(
            state.read_with(cx, |s, _| s.layout().settings_section),
            category
        );
    }

    let settings_entity = window
        .read_with(cx, |view, _| view.settings_view().cloned())
        .unwrap()
        .unwrap();
    let _ = cx.update_window(any_window, |_view, window, cx| {
        settings_entity.update(cx, |view, cx| view.focus_search(window, cx));
    });
    cx.simulate_input(any_window, "opacity");
    draw_window(cx, any_window);

    cx.simulate_input(any_window, "zzzznotfound");
    draw_window(cx, any_window);

    cx.simulate_keystrokes(any_window, "escape");
    draw_window(cx, any_window);

    cx.dispatch_action(any_window, CloseSettingsTab);
    draw_window(cx, any_window);

    assert_eq!(
        state.read_with(cx, |s, _| s.layout().page),
        WorkbenchPage::Home
    );
    assert!(!state.read_with(cx, |s, _| s.layout().settings_tab_open));
    assert!(
        window
            .read_with(cx, |view, _| view.settings_view().is_none())
            .unwrap()
    );
}

#[gpui::test]
fn workbench_toggles_three_sidebars_moves_sessions_view_and_resets_layout(cx: &mut TestAppContext) {
    let temp = TempDir::new().unwrap();
    let (window, state) =
        try_create_workbench(cx, temp.path(), DesktopPlatform::Win32, true).unwrap();
    let any_window: AnyWindowHandle = window.into();

    cx.dispatch_action(any_window, ToggleAuxiliaryBar);
    cx.dispatch_action(any_window, ToggleTertiaryBar);
    draw_window(cx, any_window);

    state.read_with(cx, |s, _| {
        assert!(s.layout().sidebar_open);
        assert!(s.layout().auxiliary_open);
        assert!(s.layout().tertiary_open);
    });

    state.update(cx, |s, cx| {
        assert!(
            s.move_view_to_location(SESSIONS_VIEW_ID, ViewContainerLocation::AuxiliaryBar, cx,)
        );
    });
    draw_window(cx, any_window);
    state.read_with(cx, |s, _| {
        assert_eq!(
            s.views().view_location(SESSIONS_VIEW_ID),
            Some(ViewContainerLocation::AuxiliaryBar)
        );
        assert!(!s.layout().sidebar_open);
        assert!(s.layout().auxiliary_open);
    });

    cx.dispatch_action(any_window, ToggleSidebar);
    draw_window(cx, any_window);
    assert!(state.read_with(cx, |s, _| s.layout().sidebar_open));

    state.update(cx, |s, cx| {
        assert!(s.move_view_to_location(SESSIONS_VIEW_ID, ViewContainerLocation::TertiaryBar, cx,));
    });
    draw_window(cx, any_window);
    assert_eq!(
        state.read_with(cx, |s, _| s.views().view_location(SESSIONS_VIEW_ID)),
        Some(ViewContainerLocation::TertiaryBar)
    );

    cx.dispatch_action(any_window, ToggleSideBarPosition);
    cx.dispatch_action(any_window, ToggleStatusBar);
    draw_window(cx, any_window);
    state.read_with(cx, |s, _| {
        assert_eq!(s.layout().side_bar_position, SideBarPosition::Right);
        assert!(!s.layout().status_bar_visible);
    });

    cx.dispatch_action(any_window, ResetLayout);
    draw_window(cx, any_window);
    state.read_with(cx, |s, _| {
        assert!(s.layout().sidebar_open);
        assert_eq!(s.layout().sidebar_width, SIDEBAR_DEFAULT_WIDTH);
        assert!(!s.layout().auxiliary_open);
        assert!(!s.layout().tertiary_open);
        assert_eq!(s.layout().tertiary_height, TERTIARY_DEFAULT_HEIGHT);
        assert_eq!(s.layout().side_bar_position, SideBarPosition::Left);
        assert!(s.layout().status_bar_visible);
        assert_eq!(
            s.views().view_location(SESSIONS_VIEW_ID),
            Some(ViewContainerLocation::Sidebar)
        );
    });
}

#[gpui::test]
fn workbench_zoom_actions_update_zoom_level_and_window_rem_size(cx: &mut TestAppContext) {
    let temp = TempDir::new().unwrap();
    let (window, state) =
        try_create_workbench(cx, temp.path(), DesktopPlatform::Win32, true).unwrap();
    let any_window: AnyWindowHandle = window.into();

    let initial_rem = cx
        .update_window(any_window, |_, window, _| window.rem_size())
        .unwrap();
    assert_eq!(initial_rem, scaled_rem_size(0.0));

    cx.dispatch_action(any_window, ZoomIn);
    draw_window(cx, any_window);
    assert_eq!(state.read_with(cx, |s, _| s.config().zoom_level), 1.0);
    let rem_plus_one = cx
        .update_window(any_window, |_, window, _| window.rem_size())
        .unwrap();
    assert_eq!(rem_plus_one, scaled_rem_size(1.0));
    assert!(rem_plus_one > initial_rem);

    cx.dispatch_action(any_window, ZoomOut);
    cx.dispatch_action(any_window, ZoomOut);
    draw_window(cx, any_window);
    assert_eq!(state.read_with(cx, |s, _| s.config().zoom_level), -1.0);
    let rem_minus_one = cx
        .update_window(any_window, |_, window, _| window.rem_size())
        .unwrap();
    assert_eq!(rem_minus_one, scaled_rem_size(-1.0));
    assert!(rem_minus_one < initial_rem);

    cx.dispatch_action(any_window, ZoomReset);
    draw_window(cx, any_window);
    assert_eq!(state.read_with(cx, |s, _| s.config().zoom_level), 0.0);
    let rem_reset = cx
        .update_window(any_window, |_, window, _| window.rem_size())
        .unwrap();
    assert_eq!(rem_reset, scaled_rem_size(0.0));
}

#[gpui::test]
fn workbench_overlays_render_and_dismiss_via_action(cx: &mut TestAppContext) {
    let temp = TempDir::new().unwrap();
    let (window, state) =
        try_create_workbench(cx, temp.path(), DesktopPlatform::Darwin, false).unwrap();
    let any_window: AnyWindowHandle = window.into();

    let overlay = window
        .read_with(cx, |view, _| view.overlay().clone())
        .unwrap();

    overlay.update(cx, |ov, cx| {
        ov.open_context_menu(
            ContextMenuModel::new(
                point(px(120.0), px(80.0)),
                vec![
                    ContextMenuEntry::action("test-item", "Test Action", |_w, _cx| {})
                        .with_icon(Codicon::Check),
                ],
            ),
            cx,
        );
    });
    draw_window(cx, any_window);
    assert!(overlay.read_with(cx, |ov, _| ov.has_active_overlay()));

    cx.dispatch_action(any_window, DismissOverlay);
    draw_window(cx, any_window);
    assert!(!overlay.read_with(cx, |ov, _| ov.has_active_overlay()));

    let confirm_dialog = DialogModel::Confirm(ConfirmDialogModel {
        title: "Confirm?".into(),
        detail: Some("Detail text".into()),
        confirm_label: "OK".into(),
        cancel_label: "Cancel".into(),
        danger: true,
        on_confirm: Rc::new(|_w, _cx| {}),
        on_cancel: Rc::new(|_w, _cx| {}),
    });
    overlay.update(cx, |ov, cx| ov.open_dialog(confirm_dialog, cx));
    draw_window(cx, any_window);
    assert!(overlay.read_with(cx, |ov, _| ov.dialog().is_some()));

    let prompt_input = cx.new(|cx| InputBoxState::new(cx).with_value("Session"));
    let prompt_dialog = DialogModel::Prompt(PromptDialogModel {
        title: "Rename".into(),
        detail: None,
        confirm_label: "Save".into(),
        cancel_label: "Cancel".into(),
        max_length: 200,
        input: prompt_input,
        on_confirm: Rc::new(|_v, _w, _cx| {}),
        on_cancel: Rc::new(|_w, _cx| {}),
    });
    overlay.update(cx, |ov, cx| ov.open_dialog(prompt_dialog, cx));
    draw_window(cx, any_window);

    cx.dispatch_action(any_window, DismissOverlay);
    draw_window(cx, any_window);
    assert!(!overlay.read_with(cx, |ov, _| ov.has_active_overlay()));

    state.update(cx, |s, cx| {
        s.update_configuration(
            AppConfigurationPatch {
                theme: Some(ThemeMode::Dark),
                ..Default::default()
            },
            cx,
        );
    });
    let (view, visual_cx) = cx.add_window_view(|window, cx| {
        let s = state.clone();
        WorkbenchView::new(s, window, cx)
    });
    visual_cx.draw(
        point(px(0.0), px(0.0)),
        size(
            AvailableSpace::Definite(px(1180.0)),
            AvailableSpace::Definite(px(760.0)),
        ),
        |_window, _cx| gpui::div().size_full().child(view.clone()),
    );
    visual_cx.run_until_parked();
}
