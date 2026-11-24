use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use baseapp_base::DesktopPlatform;
use baseapp_platform::{
    AppConfiguration, AppConfigurationPatch, AppLocale, DEFAULT_GPUI_VERSION, EnvironmentPaths,
    HttpResponse, HttpTransport, NativeError, NativeHost, PersistedSidebarState,
    PersistedTertiaryBarState, PersistedWindowState, ProductInfo, ResolvedThemeMode, RuntimeInfo,
    SIDEBAR_DEFAULT_WIDTH, SideBarPosition, TERTIARY_DEFAULT_HEIGHT, ThemeMode, TrayIconPreset,
    UpdateError, UpdateState, UpdateStateEvent, ViewContainerLocation, WindowBounds,
    platform_os_label, platform_renderer_name,
};
use baseapp_ui::Codicon;
use baseapp_workbench::{
    DismissOverlay, LayoutState, MAX_VISIBLE_NOTIFICATIONS, NotificationSeverity,
    NotificationStore, OpenSettings, SESSIONS_VIEW_ID, SettingsCategoryId, ToggleAuxiliaryBar,
    ToggleFullScreen, ToggleSidebar, ToggleTertiaryBar, ViewDescriptor, ViewDescriptorState,
    WorkbenchEvent, WorkbenchPage, WorkbenchServices, WorkbenchState, ZoomIn, ZoomOut, ZoomReset,
    matches_settings_query, register_workbench_keybindings,
};
use gpui::{
    AppContext as _, Context, FocusHandle, InteractiveElement as _, IntoElement, OperatingSystem,
    Render, TestAppContext, Window, div,
};
use raw_window_handle::RawWindowHandle;
use tempfile::TempDir;

#[derive(Default)]
struct MockNativeState {
    opened_urls: Vec<String>,
    opened_dirs: Vec<PathBuf>,
    export_path: Option<PathBuf>,
    import_path: Option<PathBuf>,
    launch_at_startup_calls: Vec<bool>,
    fail_open_url: bool,
    fail_open_dir: bool,
}

struct MockNativeHost {
    platform: DesktopPlatform,
    version: String,
    state: Mutex<MockNativeState>,
}

impl MockNativeHost {
    fn new(platform: DesktopPlatform) -> Self {
        Self {
            platform,
            version: "3.0.0".to_string(),
            state: Mutex::new(MockNativeState::default()),
        }
    }

    fn lock_state(&self) -> std::sync::MutexGuard<'_, MockNativeState> {
        match self.state.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        }
    }

    fn set_export_path(&self, path: Option<PathBuf>) {
        self.lock_state().export_path = path;
    }

    fn set_import_path(&self, path: Option<PathBuf>) {
        self.lock_state().import_path = path;
    }

    fn opened_urls(&self) -> Vec<String> {
        self.lock_state().opened_urls.clone()
    }

    fn opened_dirs(&self) -> Vec<PathBuf> {
        self.lock_state().opened_dirs.clone()
    }

    fn launch_at_startup_calls(&self) -> Vec<bool> {
        self.lock_state().launch_at_startup_calls.clone()
    }
}

impl NativeHost for MockNativeHost {
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
        let mut guard = self.lock_state();
        if guard.fail_open_url {
            return Err(NativeError::Os("mock failure".to_string()));
        }
        guard.opened_urls.push(raw_url.to_string());
        Ok(())
    }

    fn open_directory(&self, path: &Path) -> Result<(), NativeError> {
        let mut guard = self.lock_state();
        if guard.fail_open_dir {
            return Err(NativeError::Os("mock failure".to_string()));
        }
        guard.opened_dirs.push(path.to_path_buf());
        Ok(())
    }

    fn pick_export_settings_path(&self, _default_file_name: &str) -> Option<PathBuf> {
        self.lock_state().export_path.clone()
    }

    fn pick_import_settings_path(&self) -> Option<PathBuf> {
        self.lock_state().import_path.clone()
    }

    fn set_launch_at_startup(&self, enabled: bool) -> Result<(), NativeError> {
        self.lock_state().launch_at_startup_calls.push(enabled);
        Ok(())
    }

    fn is_launch_at_startup_enabled(&self) -> Result<bool, NativeError> {
        Ok(self
            .lock_state()
            .launch_at_startup_calls
            .last()
            .copied()
            .unwrap_or(false))
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

struct MockUpdateTransport {
    status: u16,
    body: String,
}

impl HttpTransport for MockUpdateTransport {
    fn get(
        &self,
        _url: &str,
        _headers: &[(&str, &str)],
        _timeout: Duration,
    ) -> Result<HttpResponse, UpdateError> {
        Ok(HttpResponse::from_bytes(
            self.status,
            self.body.as_bytes().to_vec(),
        ))
    }
}

fn try_build_services(
    root: &Path,
    platform: DesktopPlatform,
) -> Result<(WorkbenchServices, Arc<MockNativeHost>), baseapp_platform::ConfigurationError> {
    let paths = EnvironmentPaths::from_root(root.to_path_buf(), platform);
    let host = Arc::new(MockNativeHost::new(platform));
    let services = WorkbenchServices::from_environment(
        paths,
        ProductInfo::default(),
        Arc::clone(&host) as Arc<dyn NativeHost>,
    )?;
    Ok((services, host))
}

#[test]
fn settings_categories_match_baseapp_order_and_icons() {
    assert_eq!(
        SettingsCategoryId::ALL,
        &[
            SettingsCategoryId::General,
            SettingsCategoryId::Appearance,
            SettingsCategoryId::Tray,
            SettingsCategoryId::Privacy,
            SettingsCategoryId::System,
            SettingsCategoryId::Updates,
            SettingsCategoryId::About,
        ]
    );

    let expected = [
        (
            SettingsCategoryId::General,
            "general",
            "settings.general",
            Codicon::SettingsGear,
        ),
        (
            SettingsCategoryId::Appearance,
            "appearance",
            "settings.appearance",
            Codicon::ColorMode,
        ),
        (
            SettingsCategoryId::Tray,
            "tray",
            "settings.trayAndTaskbar",
            Codicon::PanelBottom,
        ),
        (
            SettingsCategoryId::Privacy,
            "privacy",
            "settings.privacyAndData",
            Codicon::Shield,
        ),
        (
            SettingsCategoryId::System,
            "system",
            "settings.system",
            Codicon::Cpu,
        ),
        (
            SettingsCategoryId::Updates,
            "updates",
            "settings.updates",
            Codicon::Refresh,
        ),
        (
            SettingsCategoryId::About,
            "about",
            "settings.about",
            Codicon::Info,
        ),
    ];

    for (category, slug, title_key, icon) in expected {
        assert_eq!(category.as_str(), slug);
        assert_eq!(SettingsCategoryId::from_str(slug), Some(category));
        assert_eq!(
            SettingsCategoryId::from_str(&slug.to_uppercase()),
            Some(category)
        );
        assert_eq!(category.to_string(), slug);
        assert_eq!(category.title_key(), title_key);
        assert_eq!(category.icon(), icon);
    }
    assert_eq!(SettingsCategoryId::from_str("unknown"), None);
}

#[test]
fn settings_query_matches_multi_token_case_insensitive() {
    assert!(matches_settings_query("", "Window opacity"));
    assert!(matches_settings_query("   ", "Window opacity"));
    assert!(matches_settings_query(
        "opacity window",
        "Appearance Window opacity semi-transparent"
    ));
    assert!(matches_settings_query(
        "TRAY   ICON",
        "Tray & Taskbar Show tray icon"
    ));
    assert!(!matches_settings_query("tray zoom", "Tray & Taskbar"));
    assert!(matches_settings_query(
        "türkçe",
        "Arayüz dili Türkçe ayarları"
    ));
}

#[test]
fn notification_store_enforces_max_five_and_dismissal() {
    let mut store = NotificationStore::new();
    assert!(store.is_empty());
    assert_eq!(store.info(""), None);
    assert!(store.is_empty());

    let id1 = store.info("one").unwrap();
    let id2 = store.success("two").unwrap();
    let id3 = store.warn("three").unwrap();
    let id4 = store.error("four").unwrap();
    let id5 = store.info("five").unwrap();
    assert_eq!(store.len(), MAX_VISIBLE_NOTIFICATIONS);

    let id6 = store.success("six").unwrap();
    assert_eq!(store.len(), MAX_VISIBLE_NOTIFICATIONS);
    let ids: Vec<u64> = store.items().iter().map(|item| item.id).collect();
    assert_eq!(ids, vec![id2, id3, id4, id5, id6]);
    assert!(!store.dismiss(id1));
    assert!(store.dismiss(id3));
    assert_eq!(store.len(), 4);
    assert_eq!(NotificationSeverity::Info.icon(), Codicon::Info);
    assert_eq!(NotificationSeverity::Success.icon(), Codicon::Pass);
    assert_eq!(NotificationSeverity::Warning.icon(), Codicon::Warning);
    assert_eq!(NotificationSeverity::Error.icon(), Codicon::Error);

    store.clear();
    assert!(store.is_empty());
}

#[test]
fn layout_state_defaults_persisted_restore_and_edge_helpers() {
    let config = AppConfiguration::default();
    let default_layout = LayoutState::from_persisted(None, &config);
    assert_eq!(default_layout.page, WorkbenchPage::Home);
    assert!(!default_layout.settings_tab_open);
    assert_eq!(default_layout.settings_section, SettingsCategoryId::General);
    assert!(default_layout.sidebar_open);
    assert_eq!(default_layout.sidebar_width, 170.0);
    assert!(!default_layout.auxiliary_open);
    assert_eq!(default_layout.auxiliary_width, 170.0);
    assert!(!default_layout.tertiary_open);
    assert_eq!(default_layout.tertiary_height, 120.0);
    assert!(!default_layout.compact_mode);
    assert!(!default_layout.maximized);
    assert!(!default_layout.fullscreen);
    assert_eq!(default_layout.side_bar_position, SideBarPosition::Left);
    assert!(default_layout.status_bar_visible);

    assert!(default_layout.is_primary_on_edge(SideBarPosition::Left));
    assert!(!default_layout.is_primary_on_edge(SideBarPosition::Right));
    assert!(default_layout.is_edge_sidebar_visible(SideBarPosition::Left));
    assert!(!default_layout.is_edge_sidebar_visible(SideBarPosition::Right));
    assert_eq!(
        default_layout.other_sidebar_visible_width(ViewContainerLocation::Sidebar),
        0.0
    );
    assert_eq!(
        default_layout.other_sidebar_visible_width(ViewContainerLocation::AuxiliaryBar),
        170.0
    );
    assert_eq!(
        default_layout.other_sidebar_visible_width(ViewContainerLocation::TertiaryBar),
        0.0
    );

    let persisted = PersistedWindowState {
        maximized: true,
        full_screen: true,
        sidebar: Some(PersistedSidebarState {
            open: false,
            width: 100.0,
        }),
        auxiliary_bar: Some(PersistedSidebarState {
            open: true,
            width: 245.4,
        }),
        tertiary_bar: Some(PersistedTertiaryBarState {
            open: true,
            height: 80.0,
        }),
        compact_mode: Some(true),
        ..PersistedWindowState::default()
    };
    let mut restored = LayoutState::from_persisted(Some(&persisted), &config);
    assert!(!restored.sidebar_open);
    assert_eq!(restored.sidebar_width, 170.0);
    assert!(restored.auxiliary_open);
    assert_eq!(restored.auxiliary_width, 245.0);
    assert!(restored.tertiary_open);
    assert_eq!(restored.tertiary_height, 120.0);
    assert!(restored.compact_mode);
    assert!(restored.maximized);
    assert!(restored.fullscreen);
    assert!(!restored.is_edge_sidebar_visible(SideBarPosition::Right));
    assert_eq!(
        restored.other_sidebar_visible_width(ViewContainerLocation::Sidebar),
        0.0
    );

    assert!(restored.open_settings(Some(SettingsCategoryId::Appearance)));
    assert_eq!(restored.page, WorkbenchPage::Settings);
    assert!(restored.settings_tab_open);
    assert_eq!(restored.settings_section, SettingsCategoryId::Appearance);
    assert!(!restored.compact_mode);
    assert!(restored.is_edge_sidebar_visible(SideBarPosition::Right));
    assert_eq!(
        restored.other_sidebar_visible_width(ViewContainerLocation::Sidebar),
        245.0
    );

    assert!(restored.toggle_settings());
    assert_eq!(restored.page, WorkbenchPage::Home);
    assert!(restored.settings_tab_open);

    assert!(restored.close_settings_tab());
    assert!(!restored.settings_tab_open);
    assert_eq!(restored.page, WorkbenchPage::Home);

    restored.side_bar_position = SideBarPosition::Right;
    restored.status_bar_visible = false;
    restored.reset_layout();
    assert!(restored.sidebar_open);
    assert_eq!(restored.sidebar_width, SIDEBAR_DEFAULT_WIDTH);
    assert!(!restored.auxiliary_open);
    assert_eq!(restored.auxiliary_width, SIDEBAR_DEFAULT_WIDTH);
    assert!(!restored.tertiary_open);
    assert_eq!(restored.tertiary_height, TERTIARY_DEFAULT_HEIGHT);
    assert!(!restored.compact_mode);
    assert_eq!(restored.side_bar_position, SideBarPosition::Left);
    assert!(restored.status_bar_visible);
}

#[test]
fn view_descriptor_state_handles_3_sidebar_moves_and_reset() {
    let mut views = ViewDescriptorState::new();
    assert_eq!(
        views.view_location(SESSIONS_VIEW_ID),
        Some(ViewContainerLocation::Sidebar)
    );
    assert_eq!(
        views.active_view_id(ViewContainerLocation::Sidebar),
        Some(SESSIONS_VIEW_ID)
    );

    views.register_view(ViewDescriptor {
        id: "workbench.view.outline",
        title_key: "nav.outline",
        icon: Codicon::Layout,
        default_location: ViewContainerLocation::Sidebar,
        can_move_view: true,
        order: 10,
    });
    views.register_view(ViewDescriptor {
        id: "workbench.view.locked",
        title_key: "nav.locked",
        icon: Codicon::Shield,
        default_location: ViewContainerLocation::AuxiliaryBar,
        can_move_view: false,
        order: 5,
    });

    assert!(!views.move_view_to_location("workbench.view.locked", ViewContainerLocation::Sidebar));
    assert!(views.move_view_to_location(SESSIONS_VIEW_ID, ViewContainerLocation::AuxiliaryBar));
    assert_eq!(
        views.view_location(SESSIONS_VIEW_ID),
        Some(ViewContainerLocation::AuxiliaryBar)
    );
    assert_eq!(
        views.active_view_id(ViewContainerLocation::AuxiliaryBar),
        Some(SESSIONS_VIEW_ID)
    );
    assert_eq!(
        views.active_view_id(ViewContainerLocation::Sidebar),
        Some("workbench.view.outline")
    );

    assert!(views.move_view_to_location(SESSIONS_VIEW_ID, ViewContainerLocation::TertiaryBar));
    assert_eq!(
        views.view_location(SESSIONS_VIEW_ID),
        Some(ViewContainerLocation::TertiaryBar)
    );
    assert_eq!(
        views.to_persisted_locations(),
        BTreeMap::from([(
            SESSIONS_VIEW_ID.to_string(),
            ViewContainerLocation::TertiaryBar
        )])
    );

    assert!(views.move_view_to_location(SESSIONS_VIEW_ID, ViewContainerLocation::Sidebar));
    assert!(views.to_persisted_locations().is_empty());

    assert!(views.move_view_to_location(SESSIONS_VIEW_ID, ViewContainerLocation::TertiaryBar));
    assert_eq!(
        views.open_view(SESSIONS_VIEW_ID),
        Some(ViewContainerLocation::TertiaryBar)
    );
    assert!(views.reset_view_locations());
    assert!(views.to_persisted_locations().is_empty());
    assert_eq!(
        views.view_location(SESSIONS_VIEW_ID),
        Some(ViewContainerLocation::Sidebar)
    );
}

#[gpui::test]
fn workbench_state_emits_config_theme_zoom_effects_and_tray_events(cx: &mut TestAppContext) {
    let temp = TempDir::new().unwrap();
    let (services, host) = try_build_services(temp.path(), DesktopPlatform::Win32).unwrap();
    let entity = cx.new(|_| WorkbenchState::initialize(services, true));

    let events: Arc<Mutex<Vec<WorkbenchEvent>>> = Arc::new(Mutex::new(Vec::new()));
    let captured = Arc::clone(&events);
    let _subscription = cx.update(|cx| {
        cx.subscribe(&entity, move |_entity, event, _cx| {
            captured.lock().unwrap().push(event.clone());
        })
    });

    entity.read_with(cx, |state, _| {
        assert!(state.startup_error().is_none());
        assert_eq!(state.resolved_theme(), ResolvedThemeMode::Dark);
        assert_eq!(state.platform(), DesktopPlatform::Win32);
        assert!(!state.is_tray_unavailable());
        assert!(!state.is_startup_launch_unavailable());
        assert!(!state.is_hardware_acceleration_restart_required());
        assert!(!state.is_window_hidden_from_shell());
    });

    entity.update(cx, |state, cx| {
        state.set_system_is_dark(false, cx);
    });
    assert_eq!(
        entity.read_with(cx, |state, _| state.resolved_theme()),
        ResolvedThemeMode::Light
    );

    entity.update(cx, |state, cx| {
        assert!(state.cycle_theme(cx));
        assert!(state.cycle_theme(cx));
        assert!(state.cycle_theme(cx));
    });
    assert_eq!(
        entity.read_with(cx, |state, _| state.config().theme),
        ThemeMode::System
    );

    entity.update(cx, |state, cx| {
        assert!(state.zoom_in(cx));
        assert!(state.zoom_in(cx));
        assert!(state.zoom_out(cx));
        assert!(state.zoom_reset(cx));
    });
    assert_eq!(
        entity.read_with(cx, |state, _| state.config().zoom_level),
        0.0
    );

    entity.update(cx, |state, cx| {
        assert!(state.toggle_always_on_top(cx));
        state.set_live_window_opacity(0.65, cx);
        assert_eq!(state.effective_window_opacity(), 0.65);
        assert!(state.update_configuration(
            AppConfigurationPatch {
                window_opacity: Some(0.8),
                show_tray_icon: Some(true),
                tray_icon: Some(TrayIconPreset::Weather),
                ui_language: Some(AppLocale::Tr),
                launch_at_startup: Some(true),
                hardware_acceleration: Some(false),
                show_taskbar: Some(false),
                ..Default::default()
            },
            cx,
        ));
    });

    assert_eq!(host.launch_at_startup_calls(), vec![true]);
    entity.read_with(cx, |state, _| {
        assert_eq!(state.effective_window_opacity(), 0.8);
        assert_eq!(state.locale(), AppLocale::Tr);
        assert!(state.is_hardware_acceleration_restart_required());
        assert!(!state.is_window_hidden_from_shell());
        let tray = state.tray_configuration();
        assert!(tray.show_tray_icon);
        assert_eq!(tray.tray_icon, TrayIconPreset::Weather);
        assert_eq!(tray.ui_language, AppLocale::Tr);
    });

    entity.update(cx, |state, cx| {
        assert!(state.update_configuration(
            AppConfigurationPatch {
                show_tray_icon: Some(false),
                ..Default::default()
            },
            cx,
        ));
    });
    assert!(entity.read_with(cx, |state, _| state.is_window_hidden_from_shell()));

    let export_file = temp.path().join("exported.json");
    host.set_export_path(Some(export_file.clone()));
    entity.update(cx, |state, cx| {
        assert!(state.export_configuration(cx));
        assert!(state.reset_configuration(cx));
    });
    assert_eq!(
        entity.read_with(cx, |state, _| state.locale()),
        AppLocale::En
    );

    host.set_import_path(Some(export_file));
    entity.update(cx, |state, cx| {
        assert!(state.import_configuration(cx));
        state.request_toggle_fullscreen(cx);
        state.request_relaunch(cx);
        state.request_quit(cx);
    });
    assert_eq!(
        entity.read_with(cx, |state, _| state.locale()),
        AppLocale::Tr
    );

    let recorded = events.lock().unwrap().clone();
    assert!(recorded.contains(&WorkbenchEvent::ThemeChanged(ResolvedThemeMode::Light)));
    assert!(recorded.contains(&WorkbenchEvent::ThemeChanged(ResolvedThemeMode::Dark)));
    assert!(recorded.contains(&WorkbenchEvent::ZoomChanged(1.0)));
    assert!(recorded.contains(&WorkbenchEvent::ZoomChanged(2.0)));
    assert!(recorded.contains(&WorkbenchEvent::ZoomChanged(0.0)));
    assert!(recorded.contains(&WorkbenchEvent::WindowEffectsChanged));
    assert!(
        recorded
            .iter()
            .any(|event| matches!(event, WorkbenchEvent::TrayConfigChanged(_)))
    );
    assert!(recorded.contains(&WorkbenchEvent::ToggleFullScreenRequested));
    assert!(recorded.contains(&WorkbenchEvent::RelaunchRequested));
    assert!(recorded.contains(&WorkbenchEvent::QuitRequested));
}

#[gpui::test]
fn workbench_state_sessions_crud_and_delete_last_replacement(cx: &mut TestAppContext) {
    let temp = TempDir::new().unwrap();
    let (services, _host) = try_build_services(temp.path(), DesktopPlatform::Win32).unwrap();
    let entity = cx.new(|_| WorkbenchState::initialize(services, true));

    let initial_id = entity.read_with(cx, |state, _| {
        assert!(state.is_only_empty_session());
        assert_eq!(state.sessions().len(), 1);
        assert_eq!(state.window_title(), "New Session — BaseApp");
        state.current_session().unwrap().id.clone()
    });

    entity.update(cx, |state, cx| {
        state.open_settings(Some(SettingsCategoryId::About), cx);
        assert_eq!(state.window_title(), "Settings — BaseApp");
        state.close_settings_tab(cx);

        assert!(state.create_session(Some("Alpha"), cx));
    });

    let alpha_id = entity.read_with(cx, |state, _| {
        assert!(!state.is_only_empty_session());
        assert_eq!(state.sessions().len(), 2);
        assert_eq!(state.window_title(), "Alpha — BaseApp");
        state.current_session().unwrap().id.clone()
    });

    entity.update(cx, |state, cx| {
        assert!(state.rename_session(&alpha_id, "Alpha Renamed", cx));
        assert!(state.toggle_session_pinned(&initial_id, true, cx));
        assert!(state.open_session(&initial_id, cx));
    });

    entity.read_with(cx, |state, _| {
        assert_eq!(state.sessions()[0].id, initial_id);
        assert!(state.sessions()[0].pinned);
        assert_eq!(state.current_session().unwrap().id, initial_id);
    });

    entity.update(cx, |state, cx| {
        assert!(!state.rename_session(&initial_id, "   ", cx));
        assert!(!state.notifications().is_empty());
        assert!(state.delete_session(&initial_id, cx));
    });

    entity.read_with(cx, |state, _| {
        assert_eq!(state.sessions().len(), 1);
        assert_eq!(state.current_session().unwrap().id, alpha_id);
        assert_eq!(state.window_title(), "Alpha Renamed — BaseApp");
    });

    entity.update(cx, |state, cx| {
        assert!(state.delete_session(&alpha_id, cx));
    });

    let replacement_id = entity.read_with(cx, |state, _| {
        assert_eq!(state.sessions().len(), 1);
        let current = state.current_session().unwrap();
        assert_ne!(current.id, alpha_id);
        assert!(current.is_default_title);
        current.id.clone()
    });

    entity.update(cx, |state, cx| {
        assert!(state.create_session(Some("Beta"), cx));
        assert!(state.delete_all_sessions(cx));
    });

    entity.read_with(cx, |state, _| {
        assert_eq!(state.sessions().len(), 1);
        let current = state.current_session().unwrap();
        assert_ne!(current.id, replacement_id);
        assert!(state.is_only_empty_session());
    });
}

#[gpui::test]
fn workbench_state_persists_and_restores_layout_views_and_session(cx: &mut TestAppContext) {
    let temp = TempDir::new().unwrap();
    let (services, _host) = try_build_services(temp.path(), DesktopPlatform::Win32).unwrap();
    let entity = cx.new(|_| WorkbenchState::initialize(services, true));

    let active_session_id = entity.update(cx, |state, cx| {
        assert!(state.create_session(Some("Persistent Workspace"), cx));
        let session_id = state.current_session().unwrap().id.clone();

        state.set_sidebar_width(240.0, false, cx);
        state.set_sidebar_width(240.0, true, cx);
        state.set_auxiliary_width(280.0, true, cx);
        state.set_tertiary_height(190.0, true, cx);
        assert!(state.move_view_to_location(
            SESSIONS_VIEW_ID,
            ViewContainerLocation::AuxiliaryBar,
            cx
        ));
        assert!(!state.layout().sidebar_open);
        assert!(state.layout().auxiliary_open);
        state.toggle_tertiary_bar(cx);
        assert!(state.layout().tertiary_open);
        assert!(state.toggle_side_bar_position(cx));
        assert!(state.toggle_status_bar_visible(cx));
        assert!(state.persist_window_bounds(
            WindowBounds {
                x: 120,
                y: 80,
                width: 1400,
                height: 900,
            },
            true,
            false,
        ));
        session_id
    });

    let (services_reloaded, _host_reloaded) =
        try_build_services(temp.path(), DesktopPlatform::Win32).unwrap();
    let reloaded = cx.new(|_| WorkbenchState::initialize(services_reloaded, true));

    reloaded.read_with(cx, |state, _| {
        assert_eq!(state.current_session().unwrap().id, active_session_id);
        assert_eq!(state.layout().sidebar_width, 240.0);
        assert!(!state.layout().sidebar_open);
        assert!(state.layout().auxiliary_open);
        assert_eq!(state.layout().auxiliary_width, 280.0);
        assert!(state.layout().tertiary_open);
        assert_eq!(state.layout().tertiary_height, 190.0);
        assert!(state.layout().maximized);
        assert_eq!(state.layout().side_bar_position, SideBarPosition::Right);
        assert!(!state.layout().status_bar_visible);
        assert_eq!(
            state.views().view_location(SESSIONS_VIEW_ID),
            Some(ViewContainerLocation::AuxiliaryBar)
        );
    });

    reloaded.update(cx, |state, cx| {
        assert!(state.reset_layout(cx));
    });

    let (services_after_reset, _host_after_reset) =
        try_build_services(temp.path(), DesktopPlatform::Win32).unwrap();
    let after_reset = cx.new(|_| WorkbenchState::initialize(services_after_reset, true));
    after_reset.read_with(cx, |state, _| {
        assert_eq!(state.current_session().unwrap().id, active_session_id);
        assert!(state.layout().sidebar_open);
        assert_eq!(state.layout().sidebar_width, SIDEBAR_DEFAULT_WIDTH);
        assert!(!state.layout().auxiliary_open);
        assert!(!state.layout().tertiary_open);
        assert_eq!(state.layout().side_bar_position, SideBarPosition::Left);
        assert!(state.layout().status_bar_visible);
        assert_eq!(
            state.views().view_location(SESSIONS_VIEW_ID),
            Some(ViewContainerLocation::Sidebar)
        );
    });
}

#[gpui::test]
fn workbench_state_external_url_policy_logs_and_updates(cx: &mut TestAppContext) {
    let temp = TempDir::new().unwrap();
    let (services, host) = try_build_services(temp.path(), DesktopPlatform::Win32).unwrap();
    let entity = cx.new(|_| WorkbenchState::initialize(services, true));

    entity.update(cx, |state, cx| {
        assert!(state.open_external_url("https://github.com/bariskisir/BaseApp", cx));
        assert!(!state.open_external_url("https://evil.example.com/phish", cx));
        assert!(!state.open_external_url("http://github.com/bariskisir/BaseApp", cx));
        assert!(!state.open_external_url("not a url", cx));

        assert_eq!(state.notifications().len(), 3);
        assert!(
            state
                .notifications()
                .items()
                .iter()
                .all(|item| item.severity == NotificationSeverity::Error)
        );

        assert!(state.open_logs_directory(cx));
        assert!(state.open_data_directory(cx));

        state.log_service().info("Test", "sample log line");
        let summary = state.refresh_logs_summary(cx);
        assert!(summary.file_count >= 1);
        assert!(summary.total_bytes > 0);

        let cleared = state.clear_logs(cx);
        assert_eq!(cleared.file_count, 0);
        assert_eq!(cleared.total_bytes, 0);
    });

    assert_eq!(
        host.opened_urls(),
        vec!["https://github.com/bariskisir/BaseApp".to_string()]
    );
    assert_eq!(host.opened_dirs().len(), 2);

    let available_transport = MockUpdateTransport {
        status: 200,
        body: r#"{
            "tag_name": "v9.9.9",
            "name": "BaseApp v9.9.9",
            "body": "Release notes here",
            "html_url": "https://github.com/bariskisir/BaseApp/releases/tag/v9.9.9",
            "draft": false,
            "prerelease": false,
            "assets": []
        }"#
        .to_string(),
    };
    entity.update(cx, |state, cx| {
        state.check_for_updates_with_transport(available_transport, cx);
        assert_eq!(state.update_state().state, UpdateState::Checking);
    });
    cx.run_until_parked();
    entity.read_with(cx, |state, _| {
        assert_eq!(
            state.update_state(),
            &UpdateStateEvent {
                state: UpdateState::Available,
                version: Some("9.9.9".to_string()),
                percent: None,
                release_notes: Some("Release notes here".to_string()),
                message: None,
                page_url: Some(
                    "https://github.com/bariskisir/BaseApp/releases/tag/v9.9.9".to_string()
                ),
            }
        );
    });

    let uptodate_transport = MockUpdateTransport {
        status: 200,
        body: r#"{
            "tag_name": "v3.0.0",
            "name": "BaseApp v3.0.0",
            "body": "",
            "html_url": "https://github.com/bariskisir/BaseApp/releases/tag/v3.0.0",
            "draft": false,
            "prerelease": false,
            "assets": []
        }"#
        .to_string(),
    };
    entity.update(cx, |state, cx| {
        state.check_for_updates_with_transport(uptodate_transport, cx);
    });
    cx.run_until_parked();
    entity.read_with(cx, |state, _| {
        assert_eq!(state.update_state().state, UpdateState::UpToDate);
        assert_eq!(state.update_state().version.as_deref(), Some("3.0.0"));
    });

    let error_transport = MockUpdateTransport {
        status: 500,
        body: String::new(),
    };
    entity.update(cx, |state, cx| {
        state.check_for_updates_with_transport(error_transport, cx);
    });
    cx.run_until_parked();
    entity.read_with(cx, |state, _| {
        assert_eq!(state.update_state().state, UpdateState::Error);
        assert!(state.update_state().message.is_some());
    });
}

struct KeybindingTestView {
    focus_handle: FocusHandle,
    actions_fired: Vec<&'static str>,
}

impl KeybindingTestView {
    fn new(cx: &mut Context<Self>) -> Self {
        Self {
            focus_handle: cx.focus_handle(),
            actions_fired: Vec::new(),
        }
    }
}

impl Render for KeybindingTestView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .track_focus(&self.focus_handle)
            .on_action(cx.listener(|this, _: &OpenSettings, _, _| {
                this.actions_fired.push("OpenSettings");
            }))
            .on_action(cx.listener(|this, _: &ZoomIn, _, _| {
                this.actions_fired.push("ZoomIn");
            }))
            .on_action(cx.listener(|this, _: &ZoomOut, _, _| {
                this.actions_fired.push("ZoomOut");
            }))
            .on_action(cx.listener(|this, _: &ZoomReset, _, _| {
                this.actions_fired.push("ZoomReset");
            }))
            .on_action(cx.listener(|this, _: &ToggleSidebar, _, _| {
                this.actions_fired.push("ToggleSidebar");
            }))
            .on_action(cx.listener(|this, _: &ToggleAuxiliaryBar, _, _| {
                this.actions_fired.push("ToggleAuxiliaryBar");
            }))
            .on_action(cx.listener(|this, _: &ToggleTertiaryBar, _, _| {
                this.actions_fired.push("ToggleTertiaryBar");
            }))
            .on_action(cx.listener(|this, _: &ToggleFullScreen, _, _| {
                this.actions_fired.push("ToggleFullScreen");
            }))
            .on_action(cx.listener(|this, _: &DismissOverlay, _, _| {
                this.actions_fired.push("DismissOverlay");
            }))
    }
}

#[gpui::test]
fn workbench_keybindings_dispatch_expected_actions(cx: &mut TestAppContext) {
    cx.update(|cx| {
        register_workbench_keybindings(cx);
    });

    let window = cx.add_window(|window, cx| {
        let view = KeybindingTestView::new(cx);
        window.focus(&view.focus_handle, cx);
        view
    });
    cx.run_until_parked();

    let is_mac = cx.read(|cx| cx.platform_info().os == OperatingSystem::Mac);
    let fullscreen_keys = if is_mac { "ctrl-cmd-f" } else { "f11" };

    let sequence = format!(
        "secondary-, secondary-= secondary-+ secondary-- secondary-0 secondary-b secondary-alt-b secondary-j {fullscreen_keys} escape"
    );
    cx.simulate_keystrokes(window.into(), &sequence);

    let fired = window
        .read_with(cx, |view, _| view.actions_fired.clone())
        .unwrap();
    assert_eq!(
        fired,
        vec![
            "OpenSettings",
            "ZoomIn",
            "ZoomIn",
            "ZoomOut",
            "ZoomReset",
            "ToggleSidebar",
            "ToggleAuxiliaryBar",
            "ToggleTertiaryBar",
            "ToggleFullScreen",
            "DismissOverlay",
        ]
    );
}

#[gpui::test]
fn workbench_state_linux_platform_constraints_notifications_and_multi_view_moves(
    cx: &mut TestAppContext,
) {
    let temp = TempDir::new().unwrap();
    let (services, host) = try_build_services(temp.path(), DesktopPlatform::Linux).unwrap();
    let entity = cx.new(|_| WorkbenchState::initialize(services, false));

    entity.read_with(cx, |state, _| {
        assert_eq!(state.platform(), DesktopPlatform::Linux);
        assert!(state.is_tray_unavailable());
        assert!(state.is_startup_launch_unavailable());
        assert!(!state.is_window_hidden_from_shell());
        assert_eq!(state.resolved_theme(), ResolvedThemeMode::Light);
        assert_eq!(
            state.t_args("statusBar.pinnedCount", &[("count", "2")]),
            "2 pinned"
        );
    });

    entity.update(cx, |state, cx| {
        assert!(state.update_configuration(
            AppConfigurationPatch {
                launch_at_startup: Some(true),
                show_tray_icon: Some(true),
                ..Default::default()
            },
            cx,
        ));
        assert!(!state.config().launch_at_startup);
        assert!(!state.config().show_tray_icon);
        assert!(host.launch_at_startup_calls().is_empty());

        let n1 = state.notify_info("info msg", cx).unwrap();
        let n2 = state.notify_success("ok msg", cx).unwrap();
        let n3 = state.notify_warn("warn msg", cx).unwrap();
        let n4 = state.notify_error("err msg", cx).unwrap();
        assert_eq!(state.notifications().len(), 4);
        assert!(state.dismiss_notification(n2, cx));
        assert!(!state.dismiss_notification(n2, cx));
        assert_eq!(
            state
                .notifications()
                .items()
                .iter()
                .map(|item| item.id)
                .collect::<Vec<_>>(),
            vec![n1, n3, n4]
        );

        state.register_view(
            ViewDescriptor {
                id: "workbench.view.secondary",
                title_key: "nav.secondary",
                icon: Codicon::Window,
                default_location: ViewContainerLocation::Sidebar,
                can_move_view: true,
                order: 10,
            },
            cx,
        );
        state.set_active_view_id(
            ViewContainerLocation::Sidebar,
            "workbench.view.secondary",
            cx,
        );
        assert_eq!(
            state.views().active_view_id(ViewContainerLocation::Sidebar),
            Some("workbench.view.secondary")
        );

        state.set_compact_mode(true, cx);
        assert!(state.layout().compact_mode);

        assert!(state.move_view_to_location(
            "workbench.view.secondary",
            ViewContainerLocation::TertiaryBar,
            cx
        ));
        assert!(!state.layout().compact_mode);
        assert!(state.layout().sidebar_open);
        assert!(state.layout().tertiary_open);
        assert_eq!(
            state.views().active_view_id(ViewContainerLocation::Sidebar),
            Some(SESSIONS_VIEW_ID)
        );
        assert_eq!(
            state
                .views()
                .active_view_id(ViewContainerLocation::TertiaryBar),
            Some("workbench.view.secondary")
        );

        state.set_compact_mode(true, cx);
        state.open_view("workbench.view.secondary", cx);
        assert!(!state.layout().compact_mode);
        assert!(state.layout().tertiary_open);

        state.reset_view_locations(cx);
        assert_eq!(
            state.views().view_location("workbench.view.secondary"),
            Some(ViewContainerLocation::Sidebar)
        );
    });
}

#[test]
fn workbench_state_captures_startup_error_when_data_dir_is_blocked() {
    let temp = TempDir::new().unwrap();
    let blocked_root = temp.path().join("file-not-dir");
    std::fs::write(&blocked_root, b"blocking file").unwrap();

    let mut paths = EnvironmentPaths::from_root(temp.path().to_path_buf(), DesktopPlatform::Win32);
    let host = Arc::new(MockNativeHost::new(DesktopPlatform::Win32));
    let mut services = WorkbenchServices::from_environment(
        paths.clone(),
        ProductInfo::default(),
        Arc::clone(&host) as Arc<dyn NativeHost>,
    )
    .unwrap();
    paths.sessions_dir = blocked_root;
    services.paths = paths;

    let state = WorkbenchState::initialize(services, true);
    assert!(state.startup_error().is_some());
}
