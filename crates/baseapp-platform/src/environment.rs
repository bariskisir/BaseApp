use std::fs;
use std::io;
use std::path::PathBuf;

use baseapp_base::platform::{DesktopPlatform, current_platform};
use directories::ProjectDirs;

use crate::product::{APP_OWNER, APP_SLUG};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnvironmentPaths {
    pub data_dir: PathBuf,
    pub config_file: PathBuf,
    pub window_state_file: PathBuf,
    pub sessions_dir: PathBuf,
    pub logs_dir: PathBuf,
    pub updates_dir: PathBuf,
    pub platform: DesktopPlatform,
    pub is_packaged: bool,
}

impl EnvironmentPaths {
    pub fn resolve_default() -> Self {
        let root = ProjectDirs::from("com", APP_OWNER, APP_SLUG)
            .map(|dirs| dirs.data_dir().to_path_buf())
            .unwrap_or_else(|| std::env::temp_dir().join(APP_SLUG));
        Self::from_root(root, current_platform()).with_packaged(!cfg!(debug_assertions))
    }

    pub fn from_root(root: PathBuf, platform: DesktopPlatform) -> Self {
        let config_file = root.join("config.json");
        let window_state_file = root.join("window-state.json");
        let sessions_dir = root.join("sessions");
        let logs_dir = root.join("logs");
        let updates_dir = root.join("updates");

        Self {
            data_dir: root,
            config_file,
            window_state_file,
            sessions_dir,
            logs_dir,
            updates_dir,
            platform,
            is_packaged: false,
        }
    }

    pub fn with_packaged(mut self, is_packaged: bool) -> Self {
        self.is_packaged = is_packaged;
        self
    }

    pub fn ensure_directories(&self) -> io::Result<()> {
        fs::create_dir_all(&self.data_dir)?;
        fs::create_dir_all(&self.sessions_dir)?;
        fs::create_dir_all(&self.logs_dir)?;
        fs::create_dir_all(&self.updates_dir)?;
        Ok(())
    }
}
