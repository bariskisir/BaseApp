use std::fmt;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use chrono::Local;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Error,
    Warn,
    #[default]
    Info,
    Debug,
    Verbose,
}

impl LogLevel {
    pub const ALL: &'static [Self] = &[
        Self::Error,
        Self::Warn,
        Self::Info,
        Self::Debug,
        Self::Verbose,
    ];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Error => "error",
            Self::Warn => "warn",
            Self::Info => "info",
            Self::Debug => "debug",
            Self::Verbose => "verbose",
        }
    }

    pub const fn severity(self) -> u8 {
        match self {
            Self::Error => 0,
            Self::Warn => 1,
            Self::Info => 2,
            Self::Debug => 3,
            Self::Verbose => 4,
        }
    }

    pub const fn allows(self, candidate: Self) -> bool {
        candidate.severity() <= self.severity()
    }

    const fn from_u8(raw: u8) -> Self {
        match raw {
            0 => Self::Error,
            1 => Self::Warn,
            2 => Self::Info,
            3 => Self::Debug,
            4 => Self::Verbose,
            _ => Self::Info,
        }
    }
}

impl fmt::Display for LogLevel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for LogLevel {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "error" => Ok(Self::Error),
            "warn" => Ok(Self::Warn),
            "info" => Ok(Self::Info),
            "debug" => Ok(Self::Debug),
            "verbose" => Ok(Self::Verbose),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogsSummary {
    pub file_count: usize,
    pub total_bytes: u64,
}

fn lock_unpoisoned<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn is_managed_log_file(name: &str) -> bool {
    let has_log_suffix = name.ends_with(".log")
        || name.rsplit_once(".log.").is_some_and(|(_, index)| {
            !index.is_empty() && index.bytes().all(|b| b.is_ascii_digit())
        });
    if !has_log_suffix {
        return false;
    }
    name.starts_with("baseapp-") || name.starts_with("app.") || name.starts_with("app-error.")
}

#[derive(Debug)]
struct LogServiceInner {
    logs_dir: PathBuf,
    level: AtomicU8,
    write_lock: Mutex<()>,
}

#[derive(Debug, Clone)]
pub struct LogService {
    inner: Arc<LogServiceInner>,
}

impl LogService {
    pub fn new(logs_dir: PathBuf, initial_level: LogLevel) -> Self {
        Self {
            inner: Arc::new(LogServiceInner {
                logs_dir,
                level: AtomicU8::new(initial_level.severity()),
                write_lock: Mutex::new(()),
            }),
        }
    }

    pub fn logs_dir(&self) -> &Path {
        &self.inner.logs_dir
    }

    pub fn level(&self) -> LogLevel {
        LogLevel::from_u8(self.inner.level.load(Ordering::Relaxed))
    }

    pub fn set_level(&self, level: LogLevel) {
        self.inner.level.store(level.severity(), Ordering::Relaxed);
    }

    pub fn log(&self, level: LogLevel, scope: &str, message: &str) {
        if !self.level().allows(level) {
            return;
        }
        match level {
            LogLevel::Error => tracing::error!(scope, "{message}"),
            LogLevel::Warn => tracing::warn!(scope, "{message}"),
            LogLevel::Info => tracing::info!(scope, "{message}"),
            LogLevel::Debug => tracing::debug!(scope, "{message}"),
            LogLevel::Verbose => tracing::trace!(scope, "{message}"),
        }

        let now = Local::now();
        let file_name = format!("baseapp-{}.log", now.format("%Y-%m-%d"));
        let line = format!(
            "[{}] [{}] [{}] {}\n",
            now.format("%Y-%m-%d %H:%M:%S%.3f"),
            level.as_str(),
            scope,
            message
        );

        let _guard = lock_unpoisoned(&self.inner.write_lock);
        if fs::create_dir_all(&self.inner.logs_dir).is_err() {
            return;
        }
        let log_path = self.inner.logs_dir.join(file_name);
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_path) {
            let _ = file.write_all(line.as_bytes());
        }
    }

    pub fn error(&self, scope: &str, message: &str) {
        self.log(LogLevel::Error, scope, message);
    }

    pub fn warn(&self, scope: &str, message: &str) {
        self.log(LogLevel::Warn, scope, message);
    }

    pub fn info(&self, scope: &str, message: &str) {
        self.log(LogLevel::Info, scope, message);
    }

    pub fn debug(&self, scope: &str, message: &str) {
        self.log(LogLevel::Debug, scope, message);
    }

    pub fn verbose(&self, scope: &str, message: &str) {
        self.log(LogLevel::Verbose, scope, message);
    }

    pub fn get_logs_summary(&self) -> LogsSummary {
        let _guard = lock_unpoisoned(&self.inner.write_lock);
        self.compute_summary_unlocked()
    }

    pub fn clear_logs(&self) -> LogsSummary {
        let _guard = lock_unpoisoned(&self.inner.write_lock);
        if let Ok(entries) = fs::read_dir(&self.inner.logs_dir) {
            for entry in entries.flatten() {
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
                if !is_managed_log_file(name) {
                    continue;
                }
                let path = entry.path();
                if fs::remove_file(&path).is_err()
                    && let Ok(file) = OpenOptions::new().write(true).open(&path)
                {
                    let _ = file.set_len(0);
                }
            }
        }
        self.compute_summary_unlocked()
    }

    fn compute_summary_unlocked(&self) -> LogsSummary {
        let Ok(entries) = fs::read_dir(&self.inner.logs_dir) else {
            return LogsSummary::default();
        };
        let mut file_count = 0usize;
        let mut total_bytes = 0u64;
        for entry in entries.flatten() {
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
            if !is_managed_log_file(name) {
                continue;
            }
            file_count += 1;
            if let Ok(metadata) = entry.metadata() {
                total_bytes = total_bytes.saturating_add(metadata.len());
            }
        }
        LogsSummary {
            file_count,
            total_bytes,
        }
    }
}
