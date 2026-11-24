use std::fs::{self, OpenOptions};
use std::io::{self, ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use thiserror::Error;
use uuid::Uuid;

pub const TEMPORARY_SUFFIX: &str = ".tmp";
const MAX_RENAME_RETRIES: usize = 3;

#[derive(Debug, Error)]
pub enum AtomicFileError {
    #[error("I/O error at {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("JSON parse error at {path}: {source}")]
    JsonParse {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
    #[error("JSON serialization error for {path}: {source}")]
    JsonSerialize {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
}

fn create_temporary_path(path: &Path) -> PathBuf {
    let mut os_string = path.as_os_str().to_os_string();
    os_string.push(format!(".{}{TEMPORARY_SUFFIX}", Uuid::new_v4()));
    PathBuf::from(os_string)
}

fn is_retryable_rename_error(error: &io::Error) -> bool {
    if matches!(
        error.kind(),
        ErrorKind::PermissionDenied | ErrorKind::ResourceBusy
    ) {
        return true;
    }

    #[cfg(windows)]
    {
        matches!(error.raw_os_error(), Some(5 | 32 | 33))
    }

    #[cfg(unix)]
    {
        matches!(error.raw_os_error(), Some(1 | 13 | 16))
    }

    #[cfg(not(any(windows, unix)))]
    {
        false
    }
}

fn commit_temporary_file(temporary_path: &Path, target_path: &Path) -> Result<(), AtomicFileError> {
    for attempt in 0..=MAX_RENAME_RETRIES {
        match fs::rename(temporary_path, target_path) {
            Ok(()) => return Ok(()),
            Err(error) => {
                if !is_retryable_rename_error(&error) {
                    return Err(AtomicFileError::Io {
                        path: target_path.to_path_buf(),
                        source: error,
                    });
                }
                if attempt < MAX_RENAME_RETRIES {
                    thread::sleep(Duration::from_millis(25 * (attempt as u64 + 1)));
                    continue;
                }
                fs::copy(temporary_path, target_path).map_err(|copy_error| {
                    AtomicFileError::Io {
                        path: target_path.to_path_buf(),
                        source: copy_error,
                    }
                })?;
                let _ = fs::remove_file(temporary_path);
                return Ok(());
            }
        }
    }
    Ok(())
}

pub fn read_text_file(path: &Path) -> Result<Option<String>, AtomicFileError> {
    match fs::read_to_string(path) {
        Ok(content) => Ok(Some(content)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(AtomicFileError::Io {
            path: path.to_path_buf(),
            source: error,
        }),
    }
}

pub fn write_text_file_atomic(path: &Path, content: &str) -> Result<(), AtomicFileError> {
    if let Some(parent) = path.parent()
        && !parent.as_os_str().is_empty()
    {
        fs::create_dir_all(parent).map_err(|error| AtomicFileError::Io {
            path: parent.to_path_buf(),
            source: error,
        })?;
    }

    let temporary_path = create_temporary_path(path);

    let write_result = (|| -> Result<(), AtomicFileError> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary_path)
            .map_err(|error| AtomicFileError::Io {
                path: temporary_path.clone(),
                source: error,
            })?;
        file.write_all(content.as_bytes())
            .map_err(|error| AtomicFileError::Io {
                path: temporary_path.clone(),
                source: error,
            })?;
        file.sync_all().map_err(|error| AtomicFileError::Io {
            path: temporary_path.clone(),
            source: error,
        })?;
        Ok(())
    })();

    if let Err(error) = write_result {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }

    if let Err(error) = commit_temporary_file(&temporary_path, path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }

    Ok(())
}

pub fn read_json_file<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, AtomicFileError> {
    let Some(content) = read_text_file(path)? else {
        return Ok(None);
    };
    let parsed = serde_json::from_str(&content).map_err(|error| AtomicFileError::JsonParse {
        path: path.to_path_buf(),
        source: error,
    })?;
    Ok(Some(parsed))
}

pub fn read_json_value(path: &Path) -> Result<Option<Value>, AtomicFileError> {
    read_json_file(path)
}

pub fn write_json_file_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), AtomicFileError> {
    let mut serialized =
        serde_json::to_string_pretty(value).map_err(|error| AtomicFileError::JsonSerialize {
            path: path.to_path_buf(),
            source: error,
        })?;
    serialized.push('\n');
    write_text_file_atomic(path, &serialized)
}

pub fn remove_interrupted_writes(directory: &Path) -> Result<usize, AtomicFileError> {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(0),
        Err(error) => {
            return Err(AtomicFileError::Io {
                path: directory.to_path_buf(),
                source: error,
            });
        }
    };

    let mut removed = 0;
    for entry_result in entries {
        let Ok(entry) = entry_result else {
            continue;
        };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_file() {
            continue;
        }
        let file_name = entry.file_name();
        let Some(name) = file_name.to_str() else {
            continue;
        };
        if name.ends_with(TEMPORARY_SUFFIX) && fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }

    Ok(removed)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use serde::{Deserialize, Serialize};
    use tempfile::tempdir;

    use super::{
        AtomicFileError, TEMPORARY_SUFFIX, read_json_file, read_json_value, read_text_file,
        remove_interrupted_writes, write_json_file_atomic, write_text_file_atomic,
    };

    #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
    struct SamplePayload {
        count: u32,
        ok: bool,
        label: String,
    }

    #[test]
    fn creates_overwrites_and_reads_json_without_leaving_temp_files() {
        let dir = tempdir().unwrap();
        let nested_path = dir.path().join("nested").join("config.json");

        assert_eq!(read_json_file::<SamplePayload>(&nested_path).unwrap(), None);
        assert_eq!(read_json_value(&nested_path).unwrap(), None);

        let initial = SamplePayload {
            count: 1,
            ok: true,
            label: "initial".to_string(),
        };
        write_json_file_atomic(&nested_path, &initial).unwrap();
        assert_eq!(
            read_json_file::<SamplePayload>(&nested_path).unwrap(),
            Some(initial)
        );

        let updated = SamplePayload {
            count: 2,
            ok: false,
            label: "overwritten".to_string(),
        };
        write_json_file_atomic(&nested_path, &updated).unwrap();
        assert_eq!(
            read_json_file::<SamplePayload>(&nested_path).unwrap(),
            Some(updated)
        );

        let raw_text = read_text_file(&nested_path).unwrap().unwrap();
        assert!(raw_text.ends_with('\n'));

        let leftover_temps = fs::read_dir(dir.path().join("nested"))
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_str()
                    .is_some_and(|name| name.ends_with(TEMPORARY_SUFFIX))
            })
            .count();
        assert_eq!(leftover_temps, 0);
    }

    #[test]
    fn reports_corrupt_json_as_parse_error_and_missing_as_none() {
        let dir = tempdir().unwrap();
        let missing_path = dir.path().join("missing.json");
        assert!(matches!(read_json_value(&missing_path), Ok(None)));

        let corrupt_path = dir.path().join("corrupt.json");
        write_text_file_atomic(&corrupt_path, "{ not valid json").unwrap();

        let error = read_json_value(&corrupt_path).unwrap_err();
        assert!(matches!(error, AtomicFileError::JsonParse { .. }));
    }

    #[test]
    fn removes_interrupted_temporary_files_only() {
        let dir = tempdir().unwrap();
        let keep_path = dir.path().join("keep.json");
        let stale_one = dir.path().join("stale.1.tmp");
        let stale_two = dir.path().join("stale.2.tmp");

        fs::write(&keep_path, "{}").unwrap();
        fs::write(&stale_one, "{}").unwrap();
        fs::write(&stale_two, "{}").unwrap();

        let removed = remove_interrupted_writes(dir.path()).unwrap();
        assert_eq!(removed, 2);
        assert!(keep_path.exists());
        assert!(!stale_one.exists());
        assert!(!stale_two.exists());

        let missing_dir = dir.path().join("does-not-exist");
        assert_eq!(remove_interrupted_writes(&missing_dir).unwrap(), 0);
    }
}
