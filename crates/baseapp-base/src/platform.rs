use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum DesktopPlatform {
    #[serde(rename = "win32")]
    Win32,
    #[serde(rename = "darwin")]
    Darwin,
    #[serde(rename = "linux")]
    Linux,
}

impl DesktopPlatform {
    pub const ALL: &'static [Self] = &[Self::Win32, Self::Darwin, Self::Linux];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Win32 => "win32",
            Self::Darwin => "darwin",
            Self::Linux => "linux",
        }
    }
}

impl fmt::Display for DesktopPlatform {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for DesktopPlatform {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "win32" => Ok(Self::Win32),
            "darwin" => Ok(Self::Darwin),
            "linux" => Ok(Self::Linux),
            _ => Err(()),
        }
    }
}

pub fn to_desktop_platform(platform: &str) -> DesktopPlatform {
    match platform {
        "win32" => DesktopPlatform::Win32,
        "darwin" => DesktopPlatform::Darwin,
        _ => DesktopPlatform::Linux,
    }
}

pub const fn current_platform() -> DesktopPlatform {
    if cfg!(target_os = "windows") {
        DesktopPlatform::Win32
    } else if cfg!(target_os = "macos") {
        DesktopPlatform::Darwin
    } else {
        DesktopPlatform::Linux
    }
}

pub const fn is_tray_supported(platform: DesktopPlatform) -> bool {
    !matches!(platform, DesktopPlatform::Linux)
}

pub const fn is_startup_launch_supported(platform: DesktopPlatform) -> bool {
    !matches!(platform, DesktopPlatform::Linux)
}

#[cfg(test)]
mod tests {
    use super::{
        DesktopPlatform, current_platform, is_startup_launch_supported, is_tray_supported,
        to_desktop_platform,
    };

    #[test]
    fn maps_platforms_and_capabilities() {
        assert_eq!(to_desktop_platform("win32"), DesktopPlatform::Win32);
        assert_eq!(to_desktop_platform("darwin"), DesktopPlatform::Darwin);
        assert_eq!(to_desktop_platform("linux"), DesktopPlatform::Linux);
        assert_eq!(to_desktop_platform("freebsd"), DesktopPlatform::Linux);

        assert!(is_tray_supported(DesktopPlatform::Win32));
        assert!(is_tray_supported(DesktopPlatform::Darwin));
        assert!(!is_tray_supported(DesktopPlatform::Linux));

        assert!(is_startup_launch_supported(DesktopPlatform::Win32));
        assert!(is_startup_launch_supported(DesktopPlatform::Darwin));
        assert!(!is_startup_launch_supported(DesktopPlatform::Linux));

        assert!(DesktopPlatform::ALL.contains(&current_platform()));
    }

    #[test]
    fn serde_round_trips_desktop_platform() {
        assert_eq!(
            serde_json::to_string(&DesktopPlatform::Win32).unwrap(),
            "\"win32\""
        );
        assert_eq!(
            serde_json::to_string(&DesktopPlatform::Darwin).unwrap(),
            "\"darwin\""
        );
        assert_eq!(
            serde_json::to_string(&DesktopPlatform::Linux).unwrap(),
            "\"linux\""
        );
        for platform in DesktopPlatform::ALL {
            let serialized = serde_json::to_string(platform).unwrap();
            let parsed: DesktopPlatform = serde_json::from_str(&serialized).unwrap();
            assert_eq!(parsed, *platform);
        }
    }
}
