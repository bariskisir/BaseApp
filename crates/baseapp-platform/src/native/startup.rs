use std::path::PathBuf;

use auto_launch::{AutoLaunch, AutoLaunchBuilder, MacOSLaunchMode, WindowsEnableMode};
use baseapp_base::platform::{DesktopPlatform, is_startup_launch_supported};

use crate::native::NativeError;

#[derive(Debug, Clone)]
pub struct StartupLaunchManager {
    app_name: String,
    executable_path: PathBuf,
    platform: DesktopPlatform,
}

impl StartupLaunchManager {
    pub fn new(
        app_name: impl Into<String>,
        executable_path: PathBuf,
        platform: DesktopPlatform,
    ) -> Self {
        Self {
            app_name: app_name.into(),
            executable_path,
            platform,
        }
    }

    pub fn for_current_exe(
        app_name: impl Into<String>,
        platform: DesktopPlatform,
    ) -> Result<Self, NativeError> {
        let executable_path = std::env::current_exe()?;
        Ok(Self::new(app_name, executable_path, platform))
    }

    pub const fn is_supported(&self) -> bool {
        is_startup_launch_supported(self.platform)
    }

    pub fn set_enabled(&self, enabled: bool) -> Result<(), NativeError> {
        if !self.is_supported() {
            if enabled {
                return Err(NativeError::UnsupportedPlatform(
                    "Launch at startup is not supported on this platform.".to_string(),
                ));
            }
            return Ok(());
        }
        let launcher = self.build_launcher()?;
        if enabled {
            launcher
                .enable()
                .map_err(|error| NativeError::StartupLaunch(error.to_string()))
        } else if launcher.is_enabled().unwrap_or(false) {
            launcher
                .disable()
                .map_err(|error| NativeError::StartupLaunch(error.to_string()))
        } else {
            Ok(())
        }
    }

    pub fn is_enabled(&self) -> Result<bool, NativeError> {
        if !self.is_supported() {
            return Ok(false);
        }
        let launcher = self.build_launcher()?;
        launcher
            .is_enabled()
            .map_err(|error| NativeError::StartupLaunch(error.to_string()))
    }

    fn build_launcher(&self) -> Result<AutoLaunch, NativeError> {
        let Some(path_str) = self.executable_path.to_str() else {
            return Err(NativeError::StartupLaunch(
                "Executable path is not valid UTF-8.".to_string(),
            ));
        };
        let mut builder = AutoLaunchBuilder::new();
        builder
            .set_app_name(&self.app_name)
            .set_app_path(path_str)
            .set_windows_enable_mode(WindowsEnableMode::CurrentUser)
            .set_macos_launch_mode(MacOSLaunchMode::LaunchAgent);
        builder
            .build()
            .map_err(|error| NativeError::StartupLaunch(error.to_string()))
    }
}
