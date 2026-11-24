pub mod dialogs;
pub mod startup;
pub mod tray;
pub mod win32;

use std::io;
use std::path::{Path, PathBuf};

use baseapp_base::platform::DesktopPlatform;
use raw_window_handle::RawWindowHandle;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::configuration::{AppConfiguration, ConfigurationError};
use crate::environment::EnvironmentPaths;
use crate::product::{ProductInfo, default_product_info};
use crate::security::{ExternalUrlError, ExternalUrlPolicy};

pub use dialogs::{
    open_directory, open_external_url, pick_export_settings_path, pick_import_settings_path,
};
pub use startup::StartupLaunchManager;
pub use tray::{TrayAction, TrayConfiguration, TrayManager, decode_tray_icon_rgba};
pub use win32::{
    apply_always_on_top, apply_content_protection, apply_show_in_taskbar, apply_window_opacity,
};

pub const DEFAULT_GPUI_VERSION: &str = "0.3.14";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    pub app_version: String,
    pub rust_version: String,
    pub gpui_version: String,
    pub renderer: String,
    pub os: String,
    pub arch: String,
    pub platform: DesktopPlatform,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConfigurationExportResult {
    Completed { file_path: PathBuf },
    Canceled,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ConfigurationImportResult {
    Completed { configuration: AppConfiguration },
    Canceled,
}

#[derive(Debug, Error)]
pub enum NativeError {
    #[error(transparent)]
    ExternalUrl(#[from] ExternalUrlError),
    #[error(transparent)]
    Configuration(#[from] ConfigurationError),
    #[error("Unsupported platform operation: {0}")]
    UnsupportedPlatform(String),
    #[error("Unsupported native window handle.")]
    WindowHandleUnsupported,
    #[error("System tray error: {0}")]
    Tray(String),
    #[error("Startup launch error: {0}")]
    StartupLaunch(String),
    #[error("Operating system error: {0}")]
    Os(String),
    #[error(transparent)]
    Io(#[from] io::Error),
}

pub const fn platform_renderer_name(platform: DesktopPlatform) -> &'static str {
    match platform {
        DesktopPlatform::Win32 => "DirectX 11",
        DesktopPlatform::Darwin => "Metal",
        DesktopPlatform::Linux => "Vulkan / Blade",
    }
}

pub fn platform_os_label(platform: DesktopPlatform) -> String {
    let os_name = match platform {
        DesktopPlatform::Win32 => "Windows",
        DesktopPlatform::Darwin => "macOS",
        DesktopPlatform::Linux => "Linux",
    };
    format!("{os_name} ({})", std::env::consts::ARCH)
}

pub trait NativeHost: Send + Sync {
    fn platform(&self) -> DesktopPlatform;
    fn version(&self) -> &str;
    fn runtime_info(&self) -> RuntimeInfo;
    fn open_external_url(&self, raw_url: &str) -> Result<(), NativeError>;
    fn open_directory(&self, path: &Path) -> Result<(), NativeError>;
    fn pick_export_settings_path(&self, default_file_name: &str) -> Option<PathBuf>;
    fn pick_import_settings_path(&self) -> Option<PathBuf>;
    fn set_launch_at_startup(&self, enabled: bool) -> Result<(), NativeError>;
    fn is_launch_at_startup_enabled(&self) -> Result<bool, NativeError>;
    fn apply_always_on_top(
        &self,
        handle: RawWindowHandle,
        always_on_top: bool,
    ) -> Result<(), NativeError>;
    fn apply_window_opacity(
        &self,
        handle: RawWindowHandle,
        opacity: f64,
    ) -> Result<f64, NativeError>;
    fn apply_content_protection(
        &self,
        handle: RawWindowHandle,
        enabled: bool,
    ) -> Result<(), NativeError>;
    fn apply_show_in_taskbar(&self, handle: RawWindowHandle, show: bool)
    -> Result<(), NativeError>;
}

#[derive(Debug, Clone)]
pub struct SystemNativeHost {
    product: ProductInfo,
    environment: EnvironmentPaths,
    url_policy: ExternalUrlPolicy,
    rust_version: String,
    gpui_version: String,
}

impl SystemNativeHost {
    pub fn new(
        product: ProductInfo,
        environment: EnvironmentPaths,
        rust_version: impl Into<String>,
        gpui_version: impl Into<String>,
    ) -> Self {
        let url_policy = ExternalUrlPolicy::from_product(&product);
        Self {
            product,
            environment,
            url_policy,
            rust_version: rust_version.into(),
            gpui_version: gpui_version.into(),
        }
    }

    pub fn with_defaults(environment: EnvironmentPaths) -> Self {
        Self::new(
            default_product_info(),
            environment,
            "unknown",
            DEFAULT_GPUI_VERSION,
        )
    }

    pub fn environment(&self) -> &EnvironmentPaths {
        &self.environment
    }

    pub fn product(&self) -> &ProductInfo {
        &self.product
    }

    pub fn url_policy(&self) -> &ExternalUrlPolicy {
        &self.url_policy
    }
}

impl NativeHost for SystemNativeHost {
    fn platform(&self) -> DesktopPlatform {
        self.environment.platform
    }

    fn version(&self) -> &str {
        &self.product.version
    }

    fn runtime_info(&self) -> RuntimeInfo {
        RuntimeInfo {
            app_version: self.product.version.clone(),
            rust_version: self.rust_version.clone(),
            gpui_version: self.gpui_version.clone(),
            renderer: platform_renderer_name(self.environment.platform).to_string(),
            os: platform_os_label(self.environment.platform),
            arch: std::env::consts::ARCH.to_string(),
            platform: self.environment.platform,
        }
    }

    fn open_external_url(&self, raw_url: &str) -> Result<(), NativeError> {
        open_external_url(raw_url, &self.url_policy)
    }

    fn open_directory(&self, path: &Path) -> Result<(), NativeError> {
        open_directory(path)
    }

    fn pick_export_settings_path(&self, default_file_name: &str) -> Option<PathBuf> {
        pick_export_settings_path(default_file_name)
    }

    fn pick_import_settings_path(&self) -> Option<PathBuf> {
        pick_import_settings_path()
    }

    fn set_launch_at_startup(&self, enabled: bool) -> Result<(), NativeError> {
        let manager = StartupLaunchManager::for_current_exe(
            self.product.name.clone(),
            self.environment.platform,
        )?;
        manager.set_enabled(enabled)
    }

    fn is_launch_at_startup_enabled(&self) -> Result<bool, NativeError> {
        let manager = StartupLaunchManager::for_current_exe(
            self.product.name.clone(),
            self.environment.platform,
        )?;
        manager.is_enabled()
    }

    fn apply_always_on_top(
        &self,
        handle: RawWindowHandle,
        always_on_top: bool,
    ) -> Result<(), NativeError> {
        apply_always_on_top(handle, always_on_top)
    }

    fn apply_window_opacity(
        &self,
        handle: RawWindowHandle,
        opacity: f64,
    ) -> Result<f64, NativeError> {
        apply_window_opacity(handle, opacity)
    }

    fn apply_content_protection(
        &self,
        handle: RawWindowHandle,
        enabled: bool,
    ) -> Result<(), NativeError> {
        apply_content_protection(handle, enabled)
    }

    fn apply_show_in_taskbar(
        &self,
        handle: RawWindowHandle,
        show: bool,
    ) -> Result<(), NativeError> {
        apply_show_in_taskbar(handle, show)
    }
}
