use std::path::{Path, PathBuf};

use directories::UserDirs;
use rfd::FileDialog;

use crate::native::NativeError;
use crate::security::ExternalUrlPolicy;

pub fn pick_export_settings_path(default_file_name: &str) -> Option<PathBuf> {
    let mut dialog = FileDialog::new()
        .add_filter("JSON", &["json"])
        .set_file_name(default_file_name);
    if let Some(documents_dir) =
        UserDirs::new().and_then(|dirs| dirs.document_dir().map(Path::to_path_buf))
    {
        dialog = dialog.set_directory(documents_dir);
    }
    dialog.save_file()
}

pub fn pick_import_settings_path() -> Option<PathBuf> {
    let mut dialog = FileDialog::new().add_filter("JSON", &["json"]);
    if let Some(documents_dir) =
        UserDirs::new().and_then(|dirs| dirs.document_dir().map(Path::to_path_buf))
    {
        dialog = dialog.set_directory(documents_dir);
    }
    dialog.pick_file()
}

pub fn open_external_url(raw_url: &str, policy: &ExternalUrlPolicy) -> Result<(), NativeError> {
    let trusted = policy.assert_allowed(raw_url)?;
    open::that(trusted.as_str()).map_err(|error| NativeError::Os(error.to_string()))
}

pub fn open_directory(path: &Path) -> Result<(), NativeError> {
    open::that(path).map_err(|error| NativeError::Os(error.to_string()))
}
