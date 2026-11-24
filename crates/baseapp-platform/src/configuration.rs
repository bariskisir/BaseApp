use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::str::FromStr;

use baseapp_base::formatters::{DateFormat, TimeFormat};
use baseapp_base::fs::{
    AtomicFileError, FileOperationQueue, read_json_value, remove_interrupted_writes,
    write_json_file_atomic,
};
use baseapp_base::number::{clamp, snap_to_step};
use baseapp_base::platform::{DesktopPlatform, is_startup_launch_supported, is_tray_supported};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use thiserror::Error;

use crate::localization::AppLocale;
use crate::log::LogLevel;
use crate::theme::ThemeMode;
use crate::window::{
    DEFAULT_ZOOM_LEVEL, MAX_ZOOM_LEVEL, MIN_ZOOM_LEVEL, SideBarPosition, zoom_factor_to_zoom_level,
};

pub const SETTINGS_REVISION: u32 = 1;
pub const WINDOW_OPACITY_MIN: f64 = 0.1;
pub const WINDOW_OPACITY_MAX: f64 = 1.0;
pub const WINDOW_OPACITY_STEP: f64 = 0.1;
pub const WINDOW_OPACITY_DEFAULT: f64 = 1.0;

pub fn clamp_window_opacity(value: f64) -> f64 {
    clamp(value, WINDOW_OPACITY_MIN, WINDOW_OPACITY_MAX)
}

pub fn snap_window_opacity(value: f64) -> f64 {
    snap_to_step(
        value,
        WINDOW_OPACITY_MIN,
        WINDOW_OPACITY_MAX,
        WINDOW_OPACITY_STEP,
    )
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrayIconPreset {
    #[default]
    Default,
    Bluetooth,
    Weather,
}

impl TrayIconPreset {
    pub const ALL: &'static [Self] = &[Self::Default, Self::Bluetooth, Self::Weather];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::Bluetooth => "bluetooth",
            Self::Weather => "weather",
        }
    }
}

impl fmt::Display for TrayIconPreset {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for TrayIconPreset {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "default" => Ok(Self::Default),
            "bluetooth" => Ok(Self::Bluetooth),
            "weather" => Ok(Self::Weather),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Error)]
pub enum ConfigurationError {
    #[error("At least one setting must be provided.")]
    EmptyPatch,
    #[error("Invalid configuration patch: {0}")]
    InvalidPatch(String),
    #[error("{0}")]
    InvalidConfiguration(String),
    #[error("Imported settings file must contain a JSON object.")]
    InvalidImportPayload,
    #[error(transparent)]
    Storage(#[from] AtomicFileError),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfiguration {
    pub settings_revision: u32,
    pub ui_language: AppLocale,
    pub theme: ThemeMode,
    pub side_bar_location: SideBarPosition,
    pub status_bar_visible: bool,
    pub zoom_level: f64,
    pub date_format: DateFormat,
    pub time_format: TimeFormat,
    pub launch_at_startup: bool,
    pub hardware_acceleration: bool,
    pub always_on_top: bool,
    pub content_protection: bool,
    pub window_opacity: f64,
    pub tray_icon: TrayIconPreset,
    pub show_taskbar: bool,
    pub show_tray_icon: bool,
    pub minimize_to_tray_on_close: bool,
    pub start_minimized: bool,
    pub auto_update: bool,
    pub unattended_updates: bool,
    pub telemetry_enabled: bool,
    pub log_level: LogLevel,
}

impl Default for AppConfiguration {
    fn default() -> Self {
        Self {
            settings_revision: SETTINGS_REVISION,
            ui_language: AppLocale::DEFAULT,
            theme: ThemeMode::System,
            side_bar_location: SideBarPosition::Left,
            status_bar_visible: true,
            zoom_level: DEFAULT_ZOOM_LEVEL,
            date_format: DateFormat::Dmy,
            time_format: TimeFormat::Hour24,
            launch_at_startup: false,
            hardware_acceleration: true,
            always_on_top: false,
            content_protection: true,
            window_opacity: WINDOW_OPACITY_DEFAULT,
            tray_icon: TrayIconPreset::Default,
            show_taskbar: true,
            show_tray_icon: false,
            minimize_to_tray_on_close: false,
            start_minimized: false,
            auto_update: true,
            unattended_updates: false,
            telemetry_enabled: false,
            log_level: LogLevel::Info,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AppConfigurationPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ui_language: Option<AppLocale>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme: Option<ThemeMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side_bar_location: Option<SideBarPosition>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_bar_visible: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zoom_level: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date_format: Option<DateFormat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_format: Option<TimeFormat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub launch_at_startup: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hardware_acceleration: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub always_on_top: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_protection: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window_opacity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tray_icon: Option<TrayIconPreset>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_taskbar: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_tray_icon: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minimize_to_tray_on_close: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_minimized: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_update: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unattended_updates: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub telemetry_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_level: Option<LogLevel>,
}

impl AppConfigurationPatch {
    pub fn is_empty(&self) -> bool {
        self.ui_language.is_none()
            && self.theme.is_none()
            && self.side_bar_location.is_none()
            && self.status_bar_visible.is_none()
            && self.zoom_level.is_none()
            && self.date_format.is_none()
            && self.time_format.is_none()
            && self.launch_at_startup.is_none()
            && self.hardware_acceleration.is_none()
            && self.always_on_top.is_none()
            && self.content_protection.is_none()
            && self.window_opacity.is_none()
            && self.tray_icon.is_none()
            && self.show_taskbar.is_none()
            && self.show_tray_icon.is_none()
            && self.minimize_to_tray_on_close.is_none()
            && self.start_minimized.is_none()
            && self.auto_update.is_none()
            && self.unattended_updates.is_none()
            && self.telemetry_enabled.is_none()
            && self.log_level.is_none()
    }

    pub fn validate(&self) -> Result<(), ConfigurationError> {
        if self.is_empty() {
            return Err(ConfigurationError::EmptyPatch);
        }
        if let Some(zoom_level) = self.zoom_level
            && (!zoom_level.is_finite() || !(MIN_ZOOM_LEVEL..=MAX_ZOOM_LEVEL).contains(&zoom_level))
        {
            return Err(ConfigurationError::InvalidPatch(
                "zoomLevel is out of bounds.".to_string(),
            ));
        }
        if let Some(window_opacity) = self.window_opacity
            && (!window_opacity.is_finite()
                || !(WINDOW_OPACITY_MIN..=WINDOW_OPACITY_MAX).contains(&window_opacity))
        {
            return Err(ConfigurationError::InvalidPatch(
                "windowOpacity is out of bounds.".to_string(),
            ));
        }
        if self.show_tray_icon == Some(false) {
            if self.minimize_to_tray_on_close == Some(true) {
                return Err(ConfigurationError::InvalidConfiguration(
                    "Minimize to tray requires the tray icon to be enabled.".to_string(),
                ));
            }
            if self.start_minimized == Some(true) {
                return Err(ConfigurationError::InvalidConfiguration(
                    "Starting minimized requires the tray icon to be enabled.".to_string(),
                ));
            }
        }
        Ok(())
    }
}

pub fn validate_configuration(config: &AppConfiguration) -> Result<(), ConfigurationError> {
    if config.settings_revision != SETTINGS_REVISION {
        return Err(ConfigurationError::InvalidConfiguration(
            "Unsupported settings revision.".to_string(),
        ));
    }
    if !config.zoom_level.is_finite()
        || !(MIN_ZOOM_LEVEL..=MAX_ZOOM_LEVEL).contains(&config.zoom_level)
    {
        return Err(ConfigurationError::InvalidConfiguration(
            "zoomLevel is out of bounds.".to_string(),
        ));
    }
    if !config.window_opacity.is_finite()
        || !(WINDOW_OPACITY_MIN..=WINDOW_OPACITY_MAX).contains(&config.window_opacity)
    {
        return Err(ConfigurationError::InvalidConfiguration(
            "windowOpacity is out of bounds.".to_string(),
        ));
    }
    if config.minimize_to_tray_on_close && !config.show_tray_icon {
        return Err(ConfigurationError::InvalidConfiguration(
            "Minimize to tray requires the tray icon to be enabled.".to_string(),
        ));
    }
    if config.start_minimized && !config.show_tray_icon {
        return Err(ConfigurationError::InvalidConfiguration(
            "Starting minimized requires the tray icon to be enabled.".to_string(),
        ));
    }
    Ok(())
}

pub fn parse_configuration_patch(
    value: &Value,
) -> Result<AppConfigurationPatch, ConfigurationError> {
    let Some(object) = value.as_object() else {
        return Err(ConfigurationError::InvalidPatch(
            "Patch must be a JSON object.".to_string(),
        ));
    };
    if object.is_empty() {
        return Err(ConfigurationError::EmptyPatch);
    }
    for (key, entry) in object {
        if entry.is_null() {
            return Err(ConfigurationError::InvalidPatch(format!(
                "Setting '{key}' cannot be null."
            )));
        }
    }
    let patch: AppConfigurationPatch = serde_json::from_value(value.clone())
        .map_err(|error| ConfigurationError::InvalidPatch(error.to_string()))?;
    patch.validate()?;
    Ok(patch)
}

fn parse_enum_field<T: FromStr>(object: &Map<String, Value>, key: &str, default: T) -> T {
    object
        .get(key)
        .and_then(Value::as_str)
        .and_then(|raw| T::from_str(raw).ok())
        .unwrap_or(default)
}

fn parse_bool_field(object: &Map<String, Value>, key: &str, default: bool) -> bool {
    object.get(key).and_then(Value::as_bool).unwrap_or(default)
}

fn parse_f64_in_range(value: Option<&Value>, min: f64, max: f64, default: f64) -> f64 {
    match value.and_then(Value::as_f64) {
        Some(number) if number.is_finite() && (min..=max).contains(&number) => number,
        _ => default,
    }
}

pub fn parse_persisted_configuration(input: &Value) -> AppConfiguration {
    let defaults = AppConfiguration::default();
    let Some(object) = input.as_object() else {
        return defaults;
    };

    let zoom_level = if object.contains_key("zoomLevel") {
        parse_f64_in_range(
            object.get("zoomLevel"),
            MIN_ZOOM_LEVEL,
            MAX_ZOOM_LEVEL,
            defaults.zoom_level,
        )
    } else if let Some(page_zoom) = object.get("pageZoom").and_then(Value::as_f64) {
        let converted = zoom_factor_to_zoom_level(page_zoom);
        if converted.is_finite() && (MIN_ZOOM_LEVEL..=MAX_ZOOM_LEVEL).contains(&converted) {
            converted
        } else {
            defaults.zoom_level
        }
    } else {
        defaults.zoom_level
    };

    let show_tray_icon = parse_bool_field(object, "showTrayIcon", defaults.show_tray_icon);
    let raw_minimize = parse_bool_field(
        object,
        "minimizeToTrayOnClose",
        defaults.minimize_to_tray_on_close,
    );
    let raw_start_minimized = parse_bool_field(object, "startMinimized", defaults.start_minimized);

    AppConfiguration {
        settings_revision: SETTINGS_REVISION,
        ui_language: parse_enum_field(object, "uiLanguage", defaults.ui_language),
        theme: parse_enum_field(object, "theme", defaults.theme),
        side_bar_location: parse_enum_field(object, "sideBarLocation", defaults.side_bar_location),
        status_bar_visible: parse_bool_field(
            object,
            "statusBarVisible",
            defaults.status_bar_visible,
        ),
        zoom_level,
        date_format: parse_enum_field(object, "dateFormat", defaults.date_format),
        time_format: parse_enum_field(object, "timeFormat", defaults.time_format),
        launch_at_startup: parse_bool_field(object, "launchAtStartup", defaults.launch_at_startup),
        hardware_acceleration: parse_bool_field(
            object,
            "hardwareAcceleration",
            defaults.hardware_acceleration,
        ),
        always_on_top: parse_bool_field(object, "alwaysOnTop", defaults.always_on_top),
        content_protection: parse_bool_field(
            object,
            "contentProtection",
            defaults.content_protection,
        ),
        window_opacity: parse_f64_in_range(
            object.get("windowOpacity"),
            WINDOW_OPACITY_MIN,
            WINDOW_OPACITY_MAX,
            defaults.window_opacity,
        ),
        tray_icon: parse_enum_field(object, "trayIcon", defaults.tray_icon),
        show_taskbar: parse_bool_field(object, "showTaskbar", defaults.show_taskbar),
        show_tray_icon,
        minimize_to_tray_on_close: show_tray_icon && raw_minimize,
        start_minimized: show_tray_icon && raw_start_minimized,
        auto_update: parse_bool_field(object, "autoUpdate", defaults.auto_update),
        unattended_updates: parse_bool_field(
            object,
            "unattendedUpdates",
            defaults.unattended_updates,
        ),
        telemetry_enabled: parse_bool_field(object, "telemetryEnabled", defaults.telemetry_enabled),
        log_level: parse_enum_field(object, "logLevel", defaults.log_level),
    }
}

pub fn normalize_configuration_for_platform(
    mut configuration: AppConfiguration,
    platform: DesktopPlatform,
) -> AppConfiguration {
    if !is_tray_supported(platform) {
        configuration.show_tray_icon = false;
        configuration.minimize_to_tray_on_close = false;
        configuration.start_minimized = false;
        configuration.show_taskbar = true;
    }
    if !is_startup_launch_supported(platform) {
        configuration.launch_at_startup = false;
    }
    configuration
}

pub fn filter_configuration_patch_for_platform(
    patch: &AppConfigurationPatch,
    platform: DesktopPlatform,
) -> AppConfigurationPatch {
    let mut filtered = patch.clone();
    if !is_tray_supported(platform) {
        filtered.show_tray_icon = None;
        filtered.minimize_to_tray_on_close = None;
        filtered.start_minimized = None;
        filtered.show_taskbar = None;
    }
    if !is_startup_launch_supported(platform) {
        filtered.launch_at_startup = None;
    }
    filtered
}

fn apply_patch(base: &AppConfiguration, patch: &AppConfigurationPatch) -> AppConfiguration {
    AppConfiguration {
        settings_revision: SETTINGS_REVISION,
        ui_language: patch.ui_language.unwrap_or(base.ui_language),
        theme: patch.theme.unwrap_or(base.theme),
        side_bar_location: patch.side_bar_location.unwrap_or(base.side_bar_location),
        status_bar_visible: patch.status_bar_visible.unwrap_or(base.status_bar_visible),
        zoom_level: patch.zoom_level.unwrap_or(base.zoom_level),
        date_format: patch.date_format.unwrap_or(base.date_format),
        time_format: patch.time_format.unwrap_or(base.time_format),
        launch_at_startup: patch.launch_at_startup.unwrap_or(base.launch_at_startup),
        hardware_acceleration: patch
            .hardware_acceleration
            .unwrap_or(base.hardware_acceleration),
        always_on_top: patch.always_on_top.unwrap_or(base.always_on_top),
        content_protection: patch.content_protection.unwrap_or(base.content_protection),
        window_opacity: patch.window_opacity.unwrap_or(base.window_opacity),
        tray_icon: patch.tray_icon.unwrap_or(base.tray_icon),
        show_taskbar: patch.show_taskbar.unwrap_or(base.show_taskbar),
        show_tray_icon: patch.show_tray_icon.unwrap_or(base.show_tray_icon),
        minimize_to_tray_on_close: patch
            .minimize_to_tray_on_close
            .unwrap_or(base.minimize_to_tray_on_close),
        start_minimized: patch.start_minimized.unwrap_or(base.start_minimized),
        auto_update: patch.auto_update.unwrap_or(base.auto_update),
        unattended_updates: patch.unattended_updates.unwrap_or(base.unattended_updates),
        telemetry_enabled: patch.telemetry_enabled.unwrap_or(base.telemetry_enabled),
        log_level: patch.log_level.unwrap_or(base.log_level),
    }
}

#[derive(Debug, Clone)]
pub struct ConfigurationService {
    config_path: PathBuf,
    platform: DesktopPlatform,
    file_queue: FileOperationQueue,
    effective: AppConfiguration,
    startup_hardware_acceleration: bool,
}

impl ConfigurationService {
    pub fn load(
        config_path: PathBuf,
        platform: DesktopPlatform,
    ) -> Result<Self, ConfigurationError> {
        Self::load_with_queue(config_path, platform, FileOperationQueue::new())
    }

    pub fn load_with_queue(
        config_path: PathBuf,
        platform: DesktopPlatform,
        file_queue: FileOperationQueue,
    ) -> Result<Self, ConfigurationError> {
        if let Some(parent) = config_path.parent()
            && !parent.as_os_str().is_empty()
        {
            fs::create_dir_all(parent).map_err(|source| AtomicFileError::Io {
                path: parent.to_path_buf(),
                source,
            })?;
            remove_interrupted_writes(parent)?;
        }

        let persisted =
            file_queue.enqueue_path(&config_path, || read_persisted_unlocked(&config_path));
        let effective = normalize_configuration_for_platform(persisted, platform);
        let startup_hardware_acceleration = effective.hardware_acceleration;

        Ok(Self {
            config_path,
            platform,
            file_queue,
            effective,
            startup_hardware_acceleration,
        })
    }

    pub fn config_path(&self) -> &Path {
        &self.config_path
    }

    pub fn platform(&self) -> DesktopPlatform {
        self.platform
    }

    pub fn get(&self) -> AppConfiguration {
        self.effective.clone()
    }

    pub fn startup_hardware_acceleration(&self) -> bool {
        self.startup_hardware_acceleration
    }

    pub fn update(
        &mut self,
        patch: AppConfigurationPatch,
    ) -> Result<AppConfiguration, ConfigurationError> {
        patch.validate()?;
        let filtered = filter_configuration_patch_for_platform(&patch, self.platform);
        let next_persisted = self.file_queue.enqueue_path(&self.config_path, || {
            let current = read_persisted_unlocked(&self.config_path);
            if filtered.is_empty() {
                return Ok::<AppConfiguration, ConfigurationError>(current);
            }
            let merged = apply_patch(&current, &filtered);
            validate_configuration(&merged)?;
            write_json_file_atomic(&self.config_path, &merged)?;
            Ok(merged)
        })?;
        self.effective = normalize_configuration_for_platform(next_persisted, self.platform);
        Ok(self.effective.clone())
    }

    pub fn reset(&mut self) -> Result<AppConfiguration, ConfigurationError> {
        let next_persisted = self.file_queue.enqueue_path(&self.config_path, || {
            let defaults = AppConfiguration::default();
            validate_configuration(&defaults)?;
            write_json_file_atomic(&self.config_path, &defaults)?;
            Ok::<AppConfiguration, ConfigurationError>(defaults)
        })?;
        self.effective = normalize_configuration_for_platform(next_persisted, self.platform);
        Ok(self.effective.clone())
    }

    pub fn import_value(&mut self, value: &Value) -> Result<AppConfiguration, ConfigurationError> {
        if !value.is_object() {
            return Err(ConfigurationError::InvalidImportPayload);
        }
        let next_persisted = self.file_queue.enqueue_path(&self.config_path, || {
            let parsed = parse_persisted_configuration(value);
            write_json_file_atomic(&self.config_path, &parsed)?;
            Ok::<AppConfiguration, ConfigurationError>(parsed)
        })?;
        self.effective = normalize_configuration_for_platform(next_persisted, self.platform);
        Ok(self.effective.clone())
    }

    pub fn export_to_path(&self, path: &Path) -> Result<(), ConfigurationError> {
        self.file_queue
            .enqueue_path(path, || write_json_file_atomic(path, &self.effective))?;
        Ok(())
    }

    pub fn import_from_path(
        &mut self,
        path: &Path,
    ) -> Result<AppConfiguration, ConfigurationError> {
        let value = self
            .file_queue
            .enqueue_path(path, || read_json_value(path))?
            .ok_or(ConfigurationError::InvalidImportPayload)?;
        self.import_value(&value)
    }

    pub fn is_hardware_acceleration_restart_required(&self) -> bool {
        self.effective.hardware_acceleration != self.startup_hardware_acceleration
    }

    pub fn is_tray_unavailable(&self) -> bool {
        !is_tray_supported(self.platform)
    }

    pub fn is_startup_launch_unavailable(&self) -> bool {
        !is_startup_launch_supported(self.platform)
    }

    pub fn is_window_hidden_from_shell(&self) -> bool {
        is_tray_supported(self.platform)
            && !self.effective.show_taskbar
            && !self.effective.show_tray_icon
    }
}

fn read_persisted_unlocked(path: &Path) -> AppConfiguration {
    match read_json_value(path) {
        Ok(Some(value)) => parse_persisted_configuration(&value),
        _ => AppConfiguration::default(),
    }
}
