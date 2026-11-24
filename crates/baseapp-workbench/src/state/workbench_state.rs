use std::fs;
use std::sync::Arc;

use baseapp_base::DesktopPlatform;
use baseapp_platform::{
    AppConfiguration, AppConfigurationPatch, AppLocale, ConfigurationError, ConfigurationService,
    DEFAULT_ZOOM_LEVEL, EnvironmentPaths, ExternalUrlPolicy, GitHubReleaseClient, HttpTransport,
    LocalizationService, LogService, LogsSummary, NativeHost, PersistedSidebarState,
    PersistedTertiaryBarState, PersistedWindowState, ProductInfo, ResolvedThemeMode, RuntimeInfo,
    SIDEBAR_DEFAULT_WIDTH, SessionDocument, SessionSummary, SessionsService, SideBarPosition,
    SidebarState, TERTIARY_DEFAULT_HEIGHT, ThemeMode, ThemePalette, TrayConfiguration, UpdateState,
    UpdateStateEvent, UreqTransport, ViewContainerLocation, WindowBounds, WindowStateStore,
    ZOOM_LEVEL_STEP, clamp_window_opacity, clamp_zoom_level, compare_session_summaries,
    is_newer_version, resolve_theme_mode,
};
use gpui::{Context, EventEmitter};

use super::layout::{LayoutState, WorkbenchPage};
use super::notifications::{NotificationSeverity, NotificationStore};
use super::settings::SettingsCategoryId;
use super::views::{ViewDescriptor, ViewDescriptorState};

pub struct WorkbenchServices {
    pub paths: EnvironmentPaths,
    pub product: ProductInfo,
    pub config_service: ConfigurationService,
    pub sessions_service: SessionsService,
    pub window_state_store: WindowStateStore,
    pub localization: LocalizationService,
    pub log_service: LogService,
    pub url_policy: ExternalUrlPolicy,
    pub native_host: Arc<dyn NativeHost>,
    pub runtime_info: RuntimeInfo,
}

impl WorkbenchServices {
    pub fn from_environment(
        paths: EnvironmentPaths,
        product: ProductInfo,
        native_host: Arc<dyn NativeHost>,
    ) -> Result<Self, ConfigurationError> {
        let config_service = ConfigurationService::load(paths.config_file.clone(), paths.platform)?;
        let initial_level = config_service.get().log_level;
        let sessions_service = SessionsService::new(paths.sessions_dir.clone());
        let window_state_store = WindowStateStore::new(paths.window_state_file.clone());
        let localization = LocalizationService::new();
        let log_service = LogService::new(paths.logs_dir.clone(), initial_level);
        let url_policy = ExternalUrlPolicy::from_product(&product);
        let runtime_info = native_host.runtime_info();

        Ok(Self {
            paths,
            product,
            config_service,
            sessions_service,
            window_state_store,
            localization,
            log_service,
            url_policy,
            native_host,
            runtime_info,
        })
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum WorkbenchEvent {
    ThemeChanged(ResolvedThemeMode),
    ZoomChanged(f64),
    WindowEffectsChanged,
    TrayConfigChanged(TrayConfiguration),
    ToggleFullScreenRequested,
    RelaunchRequested,
    QuitRequested,
}

pub struct WorkbenchState {
    services: WorkbenchServices,
    config: AppConfiguration,
    system_is_dark: bool,
    resolved_theme: ResolvedThemeMode,
    live_window_opacity: Option<f64>,
    layout: LayoutState,
    views: ViewDescriptorState,
    sessions: Vec<SessionSummary>,
    current_session: Option<SessionDocument>,
    update_state: UpdateStateEvent,
    update_check_in_progress: bool,
    notifications: NotificationStore,
    logs_summary: LogsSummary,
    startup_error: Option<String>,
    last_persisted_sidebar: Option<SidebarState>,
    last_persisted_session_id: Option<String>,
}

impl EventEmitter<WorkbenchEvent> for WorkbenchState {}

impl WorkbenchState {
    pub fn initialize(services: WorkbenchServices, system_is_dark: bool) -> Self {
        let config = services.config_service.get();
        services.log_service.set_level(config.log_level);
        let resolved_theme = resolve_theme_mode(config.theme, system_is_dark);

        let mut state = Self {
            services,
            config,
            system_is_dark,
            resolved_theme,
            live_window_opacity: None,
            layout: LayoutState::default(),
            views: ViewDescriptorState::new(),
            sessions: Vec::new(),
            current_session: None,
            update_state: UpdateStateEvent::default(),
            update_check_in_progress: false,
            notifications: NotificationStore::new(),
            logs_summary: LogsSummary::default(),
            startup_error: None,
            last_persisted_sidebar: None,
            last_persisted_session_id: None,
        };
        state.bootstrap_state();
        state
    }

    pub fn retry_initialize(&mut self, cx: &mut Context<Self>) -> bool {
        self.bootstrap_state();
        cx.notify();
        self.startup_error.is_none()
    }

    fn bootstrap_state(&mut self) {
        self.startup_error = None;
        self.config = self.services.config_service.get();
        self.services.log_service.set_level(self.config.log_level);
        self.resolved_theme = resolve_theme_mode(self.config.theme, self.system_is_dark);

        if let Err(error) = self.services.paths.ensure_directories() {
            self.services.log_service.error(
                "WorkbenchState",
                &format!("Application directories could not be created: {error}"),
            );
            self.startup_error = Some(self.t("errors.startup"));
            self.layout = LayoutState::from_persisted(None, &self.config);
            self.views = ViewDescriptorState::from_persisted(None);
            self.logs_summary = self.services.log_service.get_logs_summary();
            return;
        }

        let persisted_window_state: Option<PersistedWindowState> =
            match self.services.window_state_store.load() {
                Ok(loaded) => loaded,
                Err(error) => {
                    self.services.log_service.warn(
                        "WorkbenchState",
                        &format!("Persisted window state could not be loaded: {error}"),
                    );
                    None
                }
            };

        self.layout = LayoutState::from_persisted(persisted_window_state.as_ref(), &self.config);
        self.views = ViewDescriptorState::from_persisted(persisted_window_state.as_ref());
        self.last_persisted_sidebar = persisted_window_state
            .as_ref()
            .map(|_| self.layout.to_sidebar_state(&self.views));

        let persisted_active_id = persisted_window_state
            .as_ref()
            .and_then(|window_state| window_state.active_session_id.clone());

        if let Err(error) = self.bootstrap_sessions(persisted_active_id) {
            self.services.log_service.error(
                "WorkbenchState",
                &format!("Sessions could not be initialized: {error}"),
            );
            self.startup_error = Some(self.t("errors.startup"));
        }

        self.logs_summary = self.services.log_service.get_logs_summary();
    }

    fn bootstrap_sessions(&mut self, persisted_active_id: Option<String>) -> Result<(), String> {
        self.services
            .sessions_service
            .initialize()
            .map_err(|error| error.to_string())?;
        let mut listed = self
            .services
            .sessions_service
            .list_sessions()
            .map_err(|error| error.to_string())?;
        listed.sort_by(compare_session_summaries);

        let Some(first_summary) = listed.first().cloned() else {
            let created = self
                .services
                .sessions_service
                .create_session(None)
                .map_err(|error| error.to_string())?;
            self.sessions = vec![created.to_summary()];
            self.set_current_session_internal(Some(created), true);
            return Ok(());
        };

        let preferred_id = match persisted_active_id.as_ref() {
            Some(candidate) if listed.iter().any(|summary| &summary.id == candidate) => {
                candidate.clone()
            }
            _ => first_summary.id.clone(),
        };

        let active = self.load_initial_session(&preferred_id, &first_summary.id)?;
        self.sessions = listed;
        self.upsert_session_summary(active.to_summary());

        if persisted_active_id.as_deref() == Some(active.id.as_str()) {
            self.last_persisted_session_id = Some(active.id.clone());
            self.current_session = Some(active);
        } else {
            self.set_current_session_internal(Some(active), true);
        }

        Ok(())
    }

    fn load_initial_session(
        &self,
        preferred_id: &str,
        fallback_id: &str,
    ) -> Result<SessionDocument, String> {
        match self.services.sessions_service.get_session(preferred_id) {
            Ok(session) => Ok(session),
            Err(error) => {
                self.services.log_service.warn(
                    "WorkbenchState",
                    &format!("Preferred session could not be restored: {error}"),
                );
                if preferred_id != fallback_id {
                    match self.services.sessions_service.get_session(fallback_id) {
                        Ok(session) => return Ok(session),
                        Err(fallback_error) => {
                            self.services.log_service.warn(
                                "WorkbenchState",
                                &format!(
                                    "Fallback session could not be restored: {fallback_error}"
                                ),
                            );
                        }
                    }
                }
                self.services
                    .sessions_service
                    .create_session(None)
                    .map_err(|create_error| create_error.to_string())
            }
        }
    }

    pub fn config(&self) -> &AppConfiguration {
        &self.config
    }

    pub fn resolved_theme(&self) -> ResolvedThemeMode {
        self.resolved_theme
    }

    pub fn theme_palette(&self) -> ThemePalette {
        ThemePalette::for_mode(self.resolved_theme)
    }

    pub fn locale(&self) -> AppLocale {
        self.config.ui_language
    }

    pub fn t(&self, key: &str) -> String {
        self.services.localization.t(self.config.ui_language, key)
    }

    pub fn t_args(&self, key: &str, args: &[(&str, &str)]) -> String {
        self.services
            .localization
            .t_args(self.config.ui_language, key, args)
    }

    pub fn layout(&self) -> &LayoutState {
        &self.layout
    }

    pub fn views(&self) -> &ViewDescriptorState {
        &self.views
    }

    pub fn sessions(&self) -> &[SessionSummary] {
        &self.sessions
    }

    pub fn current_session(&self) -> Option<&SessionDocument> {
        self.current_session.as_ref()
    }

    pub fn is_only_empty_session(&self) -> bool {
        self.sessions.len() == 1
            && self.current_session.as_ref().is_some_and(|session| {
                self.sessions
                    .first()
                    .is_some_and(|summary| summary.id == session.id)
                    && session.data.is_empty()
            })
    }

    pub fn update_state(&self) -> &UpdateStateEvent {
        &self.update_state
    }

    pub fn notifications(&self) -> &NotificationStore {
        &self.notifications
    }

    pub fn logs_summary(&self) -> LogsSummary {
        self.logs_summary
    }

    pub fn startup_error(&self) -> Option<&str> {
        self.startup_error.as_deref()
    }

    pub fn product(&self) -> &ProductInfo {
        &self.services.product
    }

    pub fn runtime_info(&self) -> &RuntimeInfo {
        &self.services.runtime_info
    }

    pub fn window_title(&self) -> String {
        let app_name = &self.services.product.name;
        if self.layout.page == WorkbenchPage::Settings {
            return format!("{} — {app_name}", self.t("settings.title"));
        }
        let Some(current) = &self.current_session else {
            return app_name.clone();
        };
        let title = if current.is_default_title {
            self.t("sessions.newSession")
        } else {
            current.title.clone()
        };
        format!("{title} — {app_name}")
    }

    pub fn platform(&self) -> DesktopPlatform {
        self.services.config_service.platform()
    }

    pub fn is_tray_unavailable(&self) -> bool {
        self.services.config_service.is_tray_unavailable()
    }

    pub fn is_startup_launch_unavailable(&self) -> bool {
        self.services.config_service.is_startup_launch_unavailable()
    }

    pub fn is_hardware_acceleration_restart_required(&self) -> bool {
        self.services
            .config_service
            .is_hardware_acceleration_restart_required()
    }

    pub fn is_window_hidden_from_shell(&self) -> bool {
        self.services.config_service.is_window_hidden_from_shell()
    }

    pub fn tray_configuration(&self) -> TrayConfiguration {
        TrayConfiguration {
            show_tray_icon: self.config.show_tray_icon,
            minimize_to_tray_on_close: self.config.minimize_to_tray_on_close,
            tray_icon: self.config.tray_icon,
            ui_language: self.config.ui_language,
        }
    }

    pub fn effective_window_opacity(&self) -> f64 {
        self.live_window_opacity
            .unwrap_or(self.config.window_opacity)
    }

    pub fn paths(&self) -> &EnvironmentPaths {
        &self.services.paths
    }

    pub fn localization(&self) -> &LocalizationService {
        &self.services.localization
    }

    pub fn native_host(&self) -> &Arc<dyn NativeHost> {
        &self.services.native_host
    }

    pub fn url_policy(&self) -> &ExternalUrlPolicy {
        &self.services.url_policy
    }

    pub fn log_service(&self) -> &LogService {
        &self.services.log_service
    }

    pub fn update_configuration(
        &mut self,
        patch: AppConfigurationPatch,
        cx: &mut Context<Self>,
    ) -> bool {
        if patch.is_empty() {
            return true;
        }
        match self.services.config_service.update(patch) {
            Ok(next) => {
                self.apply_configuration_transition(next, cx);
                true
            }
            Err(error) => {
                self.report_failure("Settings could not be saved.", &error, cx);
                false
            }
        }
    }

    pub fn reset_configuration(&mut self, cx: &mut Context<Self>) -> bool {
        match self.services.config_service.reset() {
            Ok(next) => {
                self.apply_configuration_transition(next, cx);
                let message = self.t("settings.settingsReset");
                self.notifications.success(message);
                cx.notify();
                true
            }
            Err(error) => {
                self.report_failure("Settings could not be reset.", &error, cx);
                false
            }
        }
    }

    pub fn export_configuration(&mut self, cx: &mut Context<Self>) -> bool {
        let default_file_name = format!("{}-settings.json", self.services.product.slug);
        let Some(path) = self
            .services
            .native_host
            .pick_export_settings_path(&default_file_name)
        else {
            return false;
        };

        match self.services.config_service.export_to_path(&path) {
            Ok(()) => {
                let message = self.t("settings.settingsExported");
                self.notifications.success(message);
                cx.notify();
                true
            }
            Err(error) => {
                self.report_failure("Settings could not be exported.", &error, cx);
                false
            }
        }
    }

    pub fn import_configuration(&mut self, cx: &mut Context<Self>) -> bool {
        let Some(path) = self.services.native_host.pick_import_settings_path() else {
            return false;
        };

        match self.services.config_service.import_from_path(&path) {
            Ok(next) => {
                self.apply_configuration_transition(next, cx);
                let message = self.t("settings.settingsImported");
                self.notifications.success(message);
                cx.notify();
                true
            }
            Err(error) => {
                self.report_failure("Settings could not be imported.", &error, cx);
                false
            }
        }
    }

    pub fn set_system_is_dark(&mut self, is_dark: bool, cx: &mut Context<Self>) {
        if self.system_is_dark == is_dark {
            return;
        }
        self.system_is_dark = is_dark;
        let next_resolved = resolve_theme_mode(self.config.theme, is_dark);
        if next_resolved != self.resolved_theme {
            self.resolved_theme = next_resolved;
            cx.emit(WorkbenchEvent::ThemeChanged(next_resolved));
            cx.notify();
        }
    }

    pub fn cycle_theme(&mut self, cx: &mut Context<Self>) -> bool {
        let next_theme = match self.config.theme {
            ThemeMode::System => ThemeMode::Light,
            ThemeMode::Light => ThemeMode::Dark,
            ThemeMode::Dark => ThemeMode::System,
        };
        self.update_configuration(
            AppConfigurationPatch {
                theme: Some(next_theme),
                ..Default::default()
            },
            cx,
        )
    }

    pub fn toggle_always_on_top(&mut self, cx: &mut Context<Self>) -> bool {
        self.update_configuration(
            AppConfigurationPatch {
                always_on_top: Some(!self.config.always_on_top),
                ..Default::default()
            },
            cx,
        )
    }

    pub fn zoom_in(&mut self, cx: &mut Context<Self>) -> bool {
        let current = self.config.zoom_level;
        let next = clamp_zoom_level(current.round() + ZOOM_LEVEL_STEP);
        if (next - current).abs() <= f64::EPSILON {
            return true;
        }
        self.update_configuration(
            AppConfigurationPatch {
                zoom_level: Some(next),
                ..Default::default()
            },
            cx,
        )
    }

    pub fn zoom_out(&mut self, cx: &mut Context<Self>) -> bool {
        let current = self.config.zoom_level;
        let next = clamp_zoom_level(current.round() - ZOOM_LEVEL_STEP);
        if (next - current).abs() <= f64::EPSILON {
            return true;
        }
        self.update_configuration(
            AppConfigurationPatch {
                zoom_level: Some(next),
                ..Default::default()
            },
            cx,
        )
    }

    pub fn zoom_reset(&mut self, cx: &mut Context<Self>) -> bool {
        self.update_configuration(
            AppConfigurationPatch {
                zoom_level: Some(DEFAULT_ZOOM_LEVEL),
                ..Default::default()
            },
            cx,
        )
    }

    pub fn set_live_window_opacity(&mut self, opacity: f64, cx: &mut Context<Self>) {
        if !opacity.is_finite() {
            return;
        }
        let clamped = clamp_window_opacity(opacity);
        if self
            .live_window_opacity
            .is_some_and(|existing| (existing - clamped).abs() <= f64::EPSILON)
        {
            return;
        }
        self.live_window_opacity = Some(clamped);
        cx.emit(WorkbenchEvent::WindowEffectsChanged);
        cx.notify();
    }

    pub fn set_page(&mut self, page: WorkbenchPage, cx: &mut Context<Self>) {
        let previous_compact = self.layout.compact_mode;
        if self.layout.set_page(page) {
            if self.layout.compact_mode != previous_compact {
                self.persist_sidebar_state();
            }
            cx.notify();
        }
    }

    pub fn open_settings(&mut self, section: Option<SettingsCategoryId>, cx: &mut Context<Self>) {
        let previous_compact = self.layout.compact_mode;
        if self.layout.open_settings(section) {
            if self.layout.compact_mode != previous_compact {
                self.persist_sidebar_state();
            }
            cx.notify();
        }
    }

    pub fn toggle_settings(&mut self, cx: &mut Context<Self>) {
        let previous_compact = self.layout.compact_mode;
        if self.layout.toggle_settings() {
            if self.layout.compact_mode != previous_compact {
                self.persist_sidebar_state();
            }
            cx.notify();
        }
    }

    pub fn close_settings_tab(&mut self, cx: &mut Context<Self>) {
        if self.layout.close_settings_tab() {
            cx.notify();
        }
    }

    pub fn set_settings_section(&mut self, section: SettingsCategoryId, cx: &mut Context<Self>) {
        if self.layout.set_settings_section(section) {
            cx.notify();
        }
    }

    pub fn toggle_sidebar(&mut self, cx: &mut Context<Self>) {
        self.set_sidebar_open(!self.layout.sidebar_open, cx);
    }

    pub fn set_sidebar_open(&mut self, open: bool, cx: &mut Context<Self>) {
        if self.layout.set_sidebar_open(open) {
            self.persist_sidebar_state();
            cx.notify();
        }
    }

    pub fn set_sidebar_width(&mut self, width: f64, persist: bool, cx: &mut Context<Self>) {
        let changed = self.layout.set_sidebar_width(width);
        if persist {
            self.persist_sidebar_state();
        }
        if changed {
            cx.notify();
        }
    }

    pub fn toggle_auxiliary_bar(&mut self, cx: &mut Context<Self>) {
        self.set_auxiliary_open(!self.layout.auxiliary_open, cx);
    }

    pub fn set_auxiliary_open(&mut self, open: bool, cx: &mut Context<Self>) {
        if self.layout.set_auxiliary_open(open) {
            self.persist_sidebar_state();
            cx.notify();
        }
    }

    pub fn set_auxiliary_width(&mut self, width: f64, persist: bool, cx: &mut Context<Self>) {
        let changed = self.layout.set_auxiliary_width(width);
        if persist {
            self.persist_sidebar_state();
        }
        if changed {
            cx.notify();
        }
    }

    pub fn toggle_tertiary_bar(&mut self, cx: &mut Context<Self>) {
        self.set_tertiary_open(!self.layout.tertiary_open, cx);
    }

    pub fn set_tertiary_open(&mut self, open: bool, cx: &mut Context<Self>) {
        if self.layout.set_tertiary_open(open) {
            self.persist_sidebar_state();
            cx.notify();
        }
    }

    pub fn set_tertiary_height(&mut self, height: f64, persist: bool, cx: &mut Context<Self>) {
        let changed = self.layout.set_tertiary_height(height);
        if persist {
            self.persist_sidebar_state();
        }
        if changed {
            cx.notify();
        }
    }

    pub fn toggle_side_bar_position(&mut self, cx: &mut Context<Self>) -> bool {
        let next = match self.config.side_bar_location {
            SideBarPosition::Left => SideBarPosition::Right,
            SideBarPosition::Right => SideBarPosition::Left,
        };
        self.update_configuration(
            AppConfigurationPatch {
                side_bar_location: Some(next),
                ..Default::default()
            },
            cx,
        )
    }

    pub fn toggle_status_bar_visible(&mut self, cx: &mut Context<Self>) -> bool {
        self.update_configuration(
            AppConfigurationPatch {
                status_bar_visible: Some(!self.config.status_bar_visible),
                ..Default::default()
            },
            cx,
        )
    }

    pub fn toggle_compact_mode(&mut self, cx: &mut Context<Self>) {
        self.set_compact_mode(!self.layout.compact_mode, cx);
    }

    pub fn set_compact_mode(&mut self, compact: bool, cx: &mut Context<Self>) {
        if self.layout.set_compact_mode(compact) {
            self.persist_sidebar_state();
            cx.notify();
        }
    }

    pub fn set_maximized(&mut self, maximized: bool, cx: &mut Context<Self>) {
        if self.layout.set_maximized(maximized) {
            cx.notify();
        }
    }

    pub fn set_fullscreen(&mut self, fullscreen: bool, cx: &mut Context<Self>) {
        if self.layout.set_fullscreen(fullscreen) {
            cx.notify();
        }
    }

    pub fn request_toggle_fullscreen(&mut self, cx: &mut Context<Self>) {
        cx.emit(WorkbenchEvent::ToggleFullScreenRequested);
    }

    pub fn reset_layout(&mut self, cx: &mut Context<Self>) -> bool {
        if let Err(error) = self
            .services
            .window_state_store
            .reset_layout(WindowBounds::default())
        {
            self.report_failure("Window layout could not be reset.", &error, cx);
            return false;
        }

        self.layout.reset_layout();
        self.views.reset_view_locations();
        self.last_persisted_sidebar = Some(self.layout.to_sidebar_state(&self.views));

        let defaults = AppConfiguration::default();
        if self.config.side_bar_location != defaults.side_bar_location
            || self.config.status_bar_visible != defaults.status_bar_visible
        {
            let _ = self.update_configuration(
                AppConfigurationPatch {
                    side_bar_location: Some(defaults.side_bar_location),
                    status_bar_visible: Some(defaults.status_bar_visible),
                    ..Default::default()
                },
                cx,
            );
        }

        let message = self.t("settings.windowLayoutReset");
        self.notifications.success(message);
        cx.notify();
        true
    }

    pub fn register_view(&mut self, descriptor: ViewDescriptor, cx: &mut Context<Self>) {
        self.views.register_view(descriptor);
        cx.notify();
    }

    pub fn move_view_to_location(
        &mut self,
        view_id: &str,
        target: ViewContainerLocation,
        cx: &mut Context<Self>,
    ) -> bool {
        let Some(descriptor) = self.views.view(view_id).cloned() else {
            return false;
        };
        if !descriptor.can_move_view {
            return false;
        }
        let Some(source) = self.views.view_location(view_id) else {
            return false;
        };

        let moved = self.views.move_view_to_location(view_id, target);
        if moved && self.views.views_by_location(source).is_empty() {
            self.layout.set_location_open(source, false);
        }
        self.layout.set_compact_mode(false);
        self.layout.set_location_open(target, true);
        self.persist_sidebar_state();
        cx.notify();
        moved
    }

    pub fn set_active_view_id(
        &mut self,
        location: ViewContainerLocation,
        view_id: &str,
        cx: &mut Context<Self>,
    ) {
        if self.views.set_active_view_id(location, view_id) {
            self.persist_sidebar_state();
            cx.notify();
        }
    }

    pub fn open_view(&mut self, view_id: &str, cx: &mut Context<Self>) {
        let Some(location) = self.views.open_view(view_id) else {
            return;
        };
        self.layout.set_compact_mode(false);
        self.layout.set_location_open(location, true);
        self.persist_sidebar_state();
        cx.notify();
    }

    pub fn reset_view_locations(&mut self, cx: &mut Context<Self>) {
        if self.views.reset_view_locations() {
            self.persist_sidebar_state();
            cx.notify();
        }
    }

    pub fn create_session(&mut self, title: Option<&str>, cx: &mut Context<Self>) -> bool {
        match self.services.sessions_service.create_session(title) {
            Ok(session) => {
                self.upsert_session_summary(session.to_summary());
                self.set_current_session_internal(Some(session), true);
                cx.notify();
                true
            }
            Err(error) => {
                self.report_failure("Session workspace could not be created.", &error, cx);
                false
            }
        }
    }

    pub fn open_session(&mut self, id: &str, cx: &mut Context<Self>) -> bool {
        match self.services.sessions_service.get_session(id) {
            Ok(session) => {
                self.set_current_session_internal(Some(session), true);
                cx.notify();
                true
            }
            Err(error) => {
                self.report_failure("Session could not be loaded.", &error, cx);
                false
            }
        }
    }

    pub fn rename_session(&mut self, id: &str, title: &str, cx: &mut Context<Self>) -> bool {
        match self.services.sessions_service.rename_session(id, title) {
            Ok(session) => {
                if self
                    .current_session
                    .as_ref()
                    .is_some_and(|current| current.id == session.id)
                {
                    self.current_session = Some(session.clone());
                }
                self.upsert_session_summary(session.to_summary());
                cx.notify();
                true
            }
            Err(error) => {
                self.report_failure("Session could not be renamed.", &error, cx);
                false
            }
        }
    }

    pub fn toggle_session_pinned(
        &mut self,
        id: &str,
        pinned: bool,
        cx: &mut Context<Self>,
    ) -> bool {
        match self
            .services
            .sessions_service
            .set_session_pinned(id, pinned)
        {
            Ok(session) => {
                if self
                    .current_session
                    .as_ref()
                    .is_some_and(|current| current.id == session.id)
                {
                    self.current_session = Some(session.clone());
                }
                self.upsert_session_summary(session.to_summary());
                cx.notify();
                true
            }
            Err(error) => {
                self.report_failure("Session pin state could not be updated.", &error, cx);
                false
            }
        }
    }

    pub fn delete_session(&mut self, id: &str, cx: &mut Context<Self>) -> bool {
        match self.services.sessions_service.delete_session(id) {
            Ok(result) => {
                if !result.deleted {
                    return false;
                }
                self.sessions.retain(|summary| summary.id != id);
                if let Some(replacement) = &result.replacement {
                    self.upsert_session_summary(replacement.to_summary());
                }

                let deleted_current = self
                    .current_session
                    .as_ref()
                    .is_some_and(|current| current.id == id);
                if deleted_current {
                    let next_session = if let Some(replacement) = result.replacement {
                        Some(replacement)
                    } else if let Some(next_id) = self.sessions.first().map(|s| s.id.clone()) {
                        match self.services.sessions_service.get_session(&next_id) {
                            Ok(session) => Some(session),
                            Err(error) => {
                                self.services.log_service.warn(
                                    "WorkbenchState",
                                    &format!("Next session could not be loaded: {error}"),
                                );
                                None
                            }
                        }
                    } else {
                        None
                    };
                    self.set_current_session_internal(next_session, true);
                }

                cx.notify();
                true
            }
            Err(error) => {
                self.report_failure("Session could not be deleted.", &error, cx);
                false
            }
        }
    }

    pub fn delete_all_sessions(&mut self, cx: &mut Context<Self>) -> bool {
        match self.services.sessions_service.delete_all_sessions() {
            Ok(replacement) => {
                self.sessions = vec![replacement.to_summary()];
                self.set_current_session_internal(Some(replacement), true);
                cx.notify();
                true
            }
            Err(error) => {
                self.report_failure("Sessions could not be deleted.", &error, cx);
                false
            }
        }
    }

    pub fn set_update_state(&mut self, event: UpdateStateEvent, cx: &mut Context<Self>) {
        if self.update_state == event {
            return;
        }
        self.update_state = event;
        cx.notify();
    }

    pub fn check_for_updates(&mut self, cx: &mut Context<Self>) {
        self.check_for_updates_with_transport(UreqTransport::new(), cx);
    }

    pub fn check_for_updates_with_transport<T>(&mut self, transport: T, cx: &mut Context<Self>)
    where
        T: HttpTransport + 'static,
    {
        if self.update_check_in_progress {
            return;
        }
        self.update_check_in_progress = true;
        self.set_update_state(
            UpdateStateEvent {
                state: UpdateState::Checking,
                ..Default::default()
            },
            cx,
        );

        let product = self.services.product.clone();
        let installed_version = self.services.product.version.clone();
        let log_service = self.services.log_service.clone();

        cx.spawn(async move |this, cx| {
            let result_event = cx
                .background_executor()
                .spawn(async move {
                    let client = GitHubReleaseClient::with_transport(transport, product);
                    match client.get_latest_release() {
                        Ok(release) => match is_newer_version(&release.version, &installed_version)
                        {
                            Ok(true) => UpdateStateEvent {
                                state: UpdateState::Available,
                                version: Some(release.version),
                                percent: None,
                                release_notes: release.release_notes,
                                message: None,
                                page_url: Some(release.page_url),
                            },
                            Ok(false) => UpdateStateEvent {
                                state: UpdateState::UpToDate,
                                version: Some(installed_version),
                                percent: None,
                                release_notes: None,
                                message: None,
                                page_url: None,
                            },
                            Err(error) => {
                                log_service.error(
                                    "WorkbenchState",
                                    &format!("Desktop update version comparison failed: {error}"),
                                );
                                UpdateStateEvent {
                                    state: UpdateState::Error,
                                    version: None,
                                    percent: None,
                                    release_notes: None,
                                    message: Some(error.to_string()),
                                    page_url: None,
                                }
                            }
                        },
                        Err(error) => {
                            log_service.error(
                                "WorkbenchState",
                                &format!("Desktop update check failed: {error}"),
                            );
                            UpdateStateEvent {
                                state: UpdateState::Error,
                                version: None,
                                percent: None,
                                release_notes: None,
                                message: Some(error.to_string()),
                                page_url: None,
                            }
                        }
                    }
                })
                .await;

            let _ = this.update(cx, |state, cx| {
                state.update_check_in_progress = false;
                state.set_update_state(result_event, cx);
            });
        })
        .detach();
    }

    pub fn refresh_logs_summary(&mut self, cx: &mut Context<Self>) -> LogsSummary {
        let summary = self.services.log_service.get_logs_summary();
        if self.logs_summary != summary {
            self.logs_summary = summary;
            cx.notify();
        }
        summary
    }

    pub fn clear_logs(&mut self, cx: &mut Context<Self>) -> LogsSummary {
        let summary = self.services.log_service.clear_logs();
        self.logs_summary = summary;
        let message = self.t("settings.logsCleared");
        self.notifications.success(message);
        cx.notify();
        summary
    }

    pub fn open_logs_directory(&mut self, cx: &mut Context<Self>) -> bool {
        if let Err(error) = fs::create_dir_all(&self.services.paths.logs_dir) {
            self.report_failure("Log directory could not be created.", &error, cx);
            return false;
        }
        match self
            .services
            .native_host
            .open_directory(&self.services.paths.logs_dir)
        {
            Ok(()) => true,
            Err(error) => {
                self.report_failure("Log directory could not be opened.", &error, cx);
                false
            }
        }
    }

    pub fn open_data_directory(&mut self, cx: &mut Context<Self>) -> bool {
        if let Err(error) = fs::create_dir_all(&self.services.paths.data_dir) {
            self.report_failure("Data directory could not be created.", &error, cx);
            return false;
        }
        match self
            .services
            .native_host
            .open_directory(&self.services.paths.data_dir)
        {
            Ok(()) => true,
            Err(error) => {
                self.report_failure("Data directory could not be opened.", &error, cx);
                false
            }
        }
    }

    pub fn open_external_url(&mut self, url: &str, cx: &mut Context<Self>) -> bool {
        if let Err(error) = self.services.url_policy.assert_allowed(url) {
            self.report_failure("External URL was blocked by security policy.", &error, cx);
            return false;
        }
        match self.services.native_host.open_external_url(url) {
            Ok(()) => true,
            Err(error) => {
                self.report_failure("External URL could not be opened.", &error, cx);
                false
            }
        }
    }

    pub fn request_relaunch(&mut self, cx: &mut Context<Self>) {
        cx.emit(WorkbenchEvent::RelaunchRequested);
    }

    pub fn request_quit(&mut self, cx: &mut Context<Self>) {
        cx.emit(WorkbenchEvent::QuitRequested);
    }

    pub fn persist_window_bounds(
        &mut self,
        bounds: WindowBounds,
        maximized: bool,
        fullscreen: bool,
    ) -> bool {
        match self
            .services
            .window_state_store
            .update_bounds(bounds, maximized, fullscreen)
        {
            Ok(_) => true,
            Err(error) => {
                self.services.log_service.warn(
                    "WorkbenchState",
                    &format!("Window bounds could not be persisted: {error}"),
                );
                false
            }
        }
    }

    pub fn notify_info(
        &mut self,
        message: impl Into<String>,
        cx: &mut Context<Self>,
    ) -> Option<u64> {
        self.push_notification(NotificationSeverity::Info, message, cx)
    }

    pub fn notify_success(
        &mut self,
        message: impl Into<String>,
        cx: &mut Context<Self>,
    ) -> Option<u64> {
        self.push_notification(NotificationSeverity::Success, message, cx)
    }

    pub fn notify_warn(
        &mut self,
        message: impl Into<String>,
        cx: &mut Context<Self>,
    ) -> Option<u64> {
        self.push_notification(NotificationSeverity::Warning, message, cx)
    }

    pub fn notify_error(
        &mut self,
        message: impl Into<String>,
        cx: &mut Context<Self>,
    ) -> Option<u64> {
        self.push_notification(NotificationSeverity::Error, message, cx)
    }

    pub fn dismiss_notification(&mut self, id: u64, cx: &mut Context<Self>) -> bool {
        if self.notifications.dismiss(id) {
            cx.notify();
            return true;
        }
        false
    }

    fn push_notification(
        &mut self,
        severity: NotificationSeverity,
        message: impl Into<String>,
        cx: &mut Context<Self>,
    ) -> Option<u64> {
        let id = self.notifications.push(severity, message);
        if id.is_some() {
            cx.notify();
        }
        id
    }

    fn apply_configuration_transition(&mut self, next: AppConfiguration, cx: &mut Context<Self>) {
        let previous = self.config.clone();
        let previous_resolved_theme = self.resolved_theme;
        let had_live_opacity = self.live_window_opacity.take().is_some();

        self.config = next;
        self.services.log_service.set_level(self.config.log_level);
        self.layout.side_bar_position = self.config.side_bar_location;
        self.layout.status_bar_visible = self.config.status_bar_visible;
        self.resolved_theme = resolve_theme_mode(self.config.theme, self.system_is_dark);

        if previous.launch_at_startup != self.config.launch_at_startup
            && !self.is_startup_launch_unavailable()
            && let Err(error) = self
                .services
                .native_host
                .set_launch_at_startup(self.config.launch_at_startup)
        {
            self.services.log_service.warn(
                "WorkbenchState",
                &format!("Startup launch setting could not be applied: {error}"),
            );
        }

        if self.resolved_theme != previous_resolved_theme {
            cx.emit(WorkbenchEvent::ThemeChanged(self.resolved_theme));
        }

        if (self.config.zoom_level - previous.zoom_level).abs() > f64::EPSILON {
            cx.emit(WorkbenchEvent::ZoomChanged(self.config.zoom_level));
        }

        let window_effects_changed = had_live_opacity
            || self.config.always_on_top != previous.always_on_top
            || (self.config.window_opacity - previous.window_opacity).abs() > f64::EPSILON
            || self.config.content_protection != previous.content_protection
            || self.config.show_taskbar != previous.show_taskbar;
        if window_effects_changed {
            cx.emit(WorkbenchEvent::WindowEffectsChanged);
        }

        let tray_changed = self.config.show_tray_icon != previous.show_tray_icon
            || self.config.minimize_to_tray_on_close != previous.minimize_to_tray_on_close
            || self.config.tray_icon != previous.tray_icon
            || self.config.ui_language != previous.ui_language;
        if tray_changed {
            cx.emit(WorkbenchEvent::TrayConfigChanged(self.tray_configuration()));
        }

        cx.notify();
    }

    fn persist_sidebar_state(&mut self) {
        let snapshot = self.layout.to_sidebar_state(&self.views);
        if self.last_persisted_sidebar.as_ref() == Some(&snapshot) {
            return;
        }
        self.last_persisted_sidebar = Some(snapshot.clone());

        let persisted_locations = snapshot
            .view_locations
            .as_ref()
            .filter(|locations| !locations.is_empty())
            .cloned();

        if let Err(error) = self.services.window_state_store.update(|state| {
            state.sidebar = Some(PersistedSidebarState {
                open: snapshot.open,
                width: snapshot.width,
            });
            state.auxiliary_bar = Some(PersistedSidebarState {
                open: snapshot.auxiliary_open.unwrap_or(false),
                width: snapshot.auxiliary_width.unwrap_or(SIDEBAR_DEFAULT_WIDTH),
            });
            state.tertiary_bar = Some(PersistedTertiaryBarState {
                open: snapshot.tertiary_open.unwrap_or(false),
                height: snapshot.tertiary_height.unwrap_or(TERTIARY_DEFAULT_HEIGHT),
            });
            state.compact_mode = Some(snapshot.compact);
            state.view_locations = persisted_locations;
            state.active_primary_view_id = snapshot.active_primary_view_id.clone();
            state.active_auxiliary_view_id = snapshot.active_auxiliary_view_id.clone();
            state.active_tertiary_view_id = snapshot.active_tertiary_view_id.clone();
        }) {
            self.services.log_service.warn(
                "WorkbenchState",
                &format!("Sidebar state could not be persisted: {error}"),
            );
        }
    }

    fn upsert_session_summary(&mut self, summary: SessionSummary) {
        self.sessions.retain(|item| item.id != summary.id);
        self.sessions.push(summary);
        self.sessions.sort_by(compare_session_summaries);
    }

    fn set_current_session_internal(&mut self, session: Option<SessionDocument>, persist: bool) {
        let next_id = session.as_ref().map(|item| item.id.clone());
        self.current_session = session;
        if !persist {
            return;
        }
        if self.last_persisted_session_id == next_id {
            return;
        }
        self.last_persisted_session_id = next_id.clone();
        if let Err(error) = self
            .services
            .window_state_store
            .update_active_session_id(next_id)
        {
            self.services.log_service.warn(
                "WorkbenchState",
                &format!("Active session identifier could not be persisted: {error}"),
            );
        }
    }

    fn report_failure(
        &mut self,
        context_message: &str,
        error: &impl std::fmt::Display,
        cx: &mut Context<Self>,
    ) {
        self.services
            .log_service
            .error("WorkbenchState", &format!("{context_message} {error}"));
        let generic_error = self.t("errors.generic");
        self.notifications.error(generic_error);
        cx.notify();
    }
}
