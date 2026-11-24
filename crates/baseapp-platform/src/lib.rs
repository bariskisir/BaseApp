pub mod configuration;
pub mod environment;
pub mod localization;
pub mod log;
pub mod native;
pub mod product;
pub mod security;
pub mod sessions;
pub mod state;
pub mod theme;
pub mod update;
pub mod window;

pub use configuration::{
    AppConfiguration, AppConfigurationPatch, ConfigurationError, ConfigurationService,
    SETTINGS_REVISION, TrayIconPreset, WINDOW_OPACITY_DEFAULT, WINDOW_OPACITY_MAX,
    WINDOW_OPACITY_MIN, WINDOW_OPACITY_STEP, clamp_window_opacity,
    filter_configuration_patch_for_platform, normalize_configuration_for_platform,
    parse_configuration_patch, parse_persisted_configuration, snap_window_opacity,
    validate_configuration,
};
pub use environment::EnvironmentPaths;
pub use localization::{AppLocale, LocalizationService, TrayMenuLabels};
pub use log::{LogLevel, LogService, LogsSummary};
pub use native::{
    ConfigurationExportResult, ConfigurationImportResult, DEFAULT_GPUI_VERSION, NativeError,
    NativeHost, RuntimeInfo, StartupLaunchManager, SystemNativeHost, TrayAction, TrayConfiguration,
    TrayManager, apply_always_on_top, apply_content_protection, apply_show_in_taskbar,
    apply_window_opacity, decode_tray_icon_rgba, open_directory, open_external_url,
    pick_export_settings_path, pick_import_settings_path, platform_os_label,
    platform_renderer_name,
};
pub use product::{
    APP_AUTHOR, APP_AUTHOR_URL, APP_ID, APP_ISSUES_URL, APP_NAME, APP_OWNER, APP_RELEASE_API_URL,
    APP_RELEASES_URL, APP_REPOSITORY, APP_REPOSITORY_URL, APP_SLUG, APP_USER_AGENT, ProductInfo,
    TELEMETRY_CONNECTION_STRING_FALLBACK, default_product_info,
};
pub use security::{ExternalUrlError, ExternalUrlPolicy};
pub use sessions::{
    DEFAULT_SESSION_TITLE, DeleteSessionResult, MAX_SESSION_TITLE_LENGTH, SessionDocument,
    SessionRepository, SessionSummary, SessionsError, SessionsService, compare_session_summaries,
    to_session_summary, validate_session_create_title, validate_session_id,
    validate_session_pin_value, validate_session_rename_title,
};
pub use state::WindowStateStore;
pub use theme::{
    ResolvedThemeMode, ShellMetrics, THEME_COLOR_TOKENS, ThemeMode, ThemePalette,
    resolve_theme_mode,
};
pub use update::{
    DownloadedRelease, GitHubRelease, GitHubReleaseAsset, GitHubReleaseClient, HttpResponse,
    HttpTransport, UpdateError, UpdateState, UpdateStateEvent, UreqTransport, assert_trusted_asset,
    current_release_arch, is_newer_version, select_windows_installer,
};
pub use window::{
    DEFAULT_WINDOW_HEIGHT, DEFAULT_WINDOW_WIDTH, DEFAULT_ZOOM_LEVEL, DisplayWorkArea,
    MAX_ZOOM_LEVEL, MIN_ZOOM_LEVEL, PersistedSidebarState, PersistedTertiaryBarState,
    PersistedWindowState, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_MIN_WORKSPACE,
    SideBarPosition, SidebarState, TERTIARY_DEFAULT_HEIGHT, TERTIARY_MIN_HEIGHT,
    TERTIARY_MIN_WORKSPACE, ViewContainerLocation, WINDOW_STATE_REVISION, WindowBounds,
    ZOOM_LEVEL_STEP, clamp_sidebar_width, clamp_tertiary_bar_height, clamp_zoom_level,
    fit_window_bounds_to_displays, get_max_sidebar_width, get_max_tertiary_bar_height,
    parse_persisted_window_state, zoom_factor_to_zoom_level, zoom_level_to_zoom_factor,
};

pub fn platform_version() -> &'static str {
    baseapp_base::WORKSPACE_VERSION
}

#[cfg(test)]
mod tests {
    use super::platform_version;

    #[test]
    fn links_base_layer() {
        assert_eq!(platform_version(), "3.0.0");
    }
}
