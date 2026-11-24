pub mod color;
pub mod formatters;
pub mod fs;
pub mod number;
pub mod platform;

pub const WORKSPACE_VERSION: &str = env!("CARGO_PKG_VERSION");

pub use color::{Color, ColorError, Rgba};
pub use formatters::{DateFormat, TimeFormat, format_bytes, format_date, format_date_utc};
pub use fs::{
    AtomicFileError, FileOperationQueue, TEMPORARY_SUFFIX, read_json_file, read_json_value,
    read_text_file, remove_interrupted_writes, write_json_file_atomic, write_text_file_atomic,
};
pub use number::{clamp, snap_to_step};
pub use platform::{
    DesktopPlatform, current_platform, is_startup_launch_supported, is_tray_supported,
    to_desktop_platform,
};

#[cfg(test)]
mod tests {
    use super::WORKSPACE_VERSION;

    #[test]
    fn exposes_workspace_version() {
        assert_eq!(WORKSPACE_VERSION, "3.0.0");
    }
}
