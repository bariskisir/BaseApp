use std::cmp::Ordering;
use std::fs;
use std::io::{self, ErrorKind};
use std::path::{Path, PathBuf};

use baseapp_base::fs::{
    AtomicFileError, FileOperationQueue, read_json_file, remove_interrupted_writes,
    write_json_file_atomic,
};
use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use thiserror::Error;
use uuid::Uuid;

pub const MAX_SESSION_TITLE_LENGTH: usize = 200;
pub const DEFAULT_SESSION_TITLE: &str = "New Session";

#[derive(Debug, Error)]
pub enum SessionsError {
    #[error("Invalid session identifier.")]
    InvalidId,
    #[error("{0}")]
    InvalidTitle(String),
    #[error("Invalid session pin state.")]
    InvalidPinState,
    #[error("Session not found: {0}")]
    NotFound(String),
    #[error("Invalid session document: {0}")]
    InvalidDocument(String),
    #[error(transparent)]
    Storage(#[from] AtomicFileError),
    #[error(transparent)]
    Io(#[from] io::Error),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDocument {
    pub id: String,
    pub title: String,
    pub is_default_title: bool,
    #[serde(default)]
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
    pub data: Map<String, Value>,
}

impl SessionDocument {
    pub fn to_summary(&self) -> SessionSummary {
        to_session_summary(self)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub title: String,
    pub is_default_title: bool,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSessionResult {
    pub deleted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replacement: Option<SessionDocument>,
}

pub fn to_session_summary(session: &SessionDocument) -> SessionSummary {
    SessionSummary {
        id: session.id.clone(),
        title: session.title.clone(),
        is_default_title: session.is_default_title,
        pinned: session.pinned,
        created_at: session.created_at.clone(),
        updated_at: session.updated_at.clone(),
    }
}

pub fn compare_session_summaries(left: &SessionSummary, right: &SessionSummary) -> Ordering {
    if left.pinned != right.pinned {
        return if left.pinned {
            Ordering::Less
        } else {
            Ordering::Greater
        };
    }
    let updated_order = right.updated_at.cmp(&left.updated_at);
    if updated_order != Ordering::Equal {
        return updated_order;
    }
    right.created_at.cmp(&left.created_at)
}

fn is_hyphenated_uuid(value: &str) -> bool {
    value.len() == 36
        && value.as_bytes().get(8) == Some(&b'-')
        && value.as_bytes().get(13) == Some(&b'-')
        && value.as_bytes().get(18) == Some(&b'-')
        && value.as_bytes().get(23) == Some(&b'-')
        && Uuid::parse_str(value).is_ok()
}

pub fn validate_session_id(id: &str) -> Result<String, SessionsError> {
    if is_hyphenated_uuid(id) {
        Ok(id.to_string())
    } else {
        Err(SessionsError::InvalidId)
    }
}

pub fn validate_session_rename_title(title: &str) -> Result<String, SessionsError> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err(SessionsError::InvalidTitle(
            "Session title cannot be empty.".to_string(),
        ));
    }
    if trimmed.chars().count() > MAX_SESSION_TITLE_LENGTH {
        return Err(SessionsError::InvalidTitle(format!(
            "Session title cannot exceed {MAX_SESSION_TITLE_LENGTH} characters."
        )));
    }
    Ok(trimmed.to_string())
}

pub fn validate_session_create_title(title: Option<&str>) -> Result<Option<String>, SessionsError> {
    let Some(raw) = title else {
        return Ok(None);
    };
    let trimmed = raw.trim();
    if trimmed.chars().count() > MAX_SESSION_TITLE_LENGTH {
        return Err(SessionsError::InvalidTitle(format!(
            "Session title cannot exceed {MAX_SESSION_TITLE_LENGTH} characters."
        )));
    }
    if trimmed.is_empty() {
        Ok(None)
    } else {
        Ok(Some(trimmed.to_string()))
    }
}

pub fn validate_session_pin_value(value: &Value) -> Result<(String, bool), SessionsError> {
    let Some(object) = value.as_object() else {
        return Err(SessionsError::InvalidPinState);
    };
    let id = object
        .get("id")
        .and_then(Value::as_str)
        .ok_or(SessionsError::InvalidId)?;
    let valid_id = validate_session_id(id)?;
    let pinned = object
        .get("pinned")
        .and_then(Value::as_bool)
        .ok_or(SessionsError::InvalidPinState)?;
    Ok((valid_id, pinned))
}

fn validate_session_document(document: &SessionDocument) -> Result<(), SessionsError> {
    validate_session_id(&document.id)?;
    let title_len = document.title.chars().count();
    if title_len == 0 || title_len > MAX_SESSION_TITLE_LENGTH {
        return Err(SessionsError::InvalidDocument(
            "Invalid session title.".to_string(),
        ));
    }
    if DateTime::parse_from_rfc3339(&document.created_at).is_err()
        || DateTime::parse_from_rfc3339(&document.updated_at).is_err()
    {
        return Err(SessionsError::InvalidDocument(
            "Invalid session timestamp.".to_string(),
        ));
    }
    Ok(())
}

fn now_iso_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[derive(Debug, Clone)]
pub struct SessionRepository {
    directory_path: PathBuf,
    queue: FileOperationQueue,
}

impl SessionRepository {
    pub fn new(directory_path: PathBuf) -> Self {
        Self::with_queue(directory_path, FileOperationQueue::new())
    }

    pub fn with_queue(directory_path: PathBuf, queue: FileOperationQueue) -> Self {
        Self {
            directory_path,
            queue,
        }
    }

    pub fn directory_path(&self) -> &Path {
        &self.directory_path
    }

    pub fn initialize(&self) -> Result<(), SessionsError> {
        fs::create_dir_all(&self.directory_path)?;
        remove_interrupted_writes(&self.directory_path)?;
        Ok(())
    }

    pub fn list(&self) -> Result<Vec<SessionSummary>, SessionsError> {
        self.list_unlocked()
    }

    pub fn create(&self, title: Option<&str>) -> Result<SessionDocument, SessionsError> {
        let normalized_title = validate_session_create_title(title)?;
        self.queue.enqueue_path(&self.directory_path, || {
            self.create_unlocked(normalized_title)
        })
    }

    pub fn get(&self, id: &str) -> Result<SessionDocument, SessionsError> {
        let valid_id = validate_session_id(id)?;
        let file_path = self.session_path(&valid_id);
        self.queue
            .enqueue_path(&file_path, || self.read_unlocked(&valid_id, &file_path))
    }

    pub fn rename(&self, id: &str, title: &str) -> Result<SessionDocument, SessionsError> {
        let valid_id = validate_session_id(id)?;
        let normalized_title = validate_session_rename_title(title)?;
        self.update_document(&valid_id, |mut session| {
            session.title = normalized_title;
            session.is_default_title = false;
            session.updated_at = now_iso_timestamp();
            session
        })
    }

    pub fn set_pinned(&self, id: &str, pinned: bool) -> Result<SessionDocument, SessionsError> {
        let valid_id = validate_session_id(id)?;
        self.update_document(&valid_id, |mut session| {
            session.pinned = pinned;
            session
        })
    }

    pub fn delete(&self, id: &str) -> Result<DeleteSessionResult, SessionsError> {
        let valid_id = validate_session_id(id)?;
        self.queue.enqueue_path(&self.directory_path, || {
            let sessions = self.list_unlocked()?;
            if !sessions.iter().any(|session| session.id == valid_id) {
                return Ok(DeleteSessionResult {
                    deleted: false,
                    replacement: None,
                });
            }

            let replacement = if sessions.len() == 1 {
                Some(self.create_unlocked(None)?)
            } else {
                None
            };

            if let Err(error) = self.remove_file(&valid_id) {
                if let Some(created) = &replacement {
                    let _ = self.remove_file(&created.id);
                }
                return Err(error);
            }

            Ok(DeleteSessionResult {
                deleted: true,
                replacement,
            })
        })
    }

    pub fn delete_all(&self) -> Result<SessionDocument, SessionsError> {
        self.queue.enqueue_path(&self.directory_path, || {
            let sessions = self.list_unlocked()?;
            let replacement = self.create_unlocked(None)?;
            for session in sessions {
                self.remove_file(&session.id)?;
            }
            Ok(replacement)
        })
    }

    fn list_unlocked(&self) -> Result<Vec<SessionSummary>, SessionsError> {
        let entries = match fs::read_dir(&self.directory_path) {
            Ok(entries) => entries,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(SessionsError::Io(error)),
        };

        let mut summaries = Vec::new();
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
            if !name.ends_with(".json") {
                continue;
            }
            let path = entry.path();
            if let Some(document) = self.try_read(&path) {
                summaries.push(document.to_summary());
            }
        }

        summaries.sort_by(compare_session_summaries);
        Ok(summaries)
    }

    fn create_unlocked(&self, title: Option<String>) -> Result<SessionDocument, SessionsError> {
        fs::create_dir_all(&self.directory_path)?;
        let now = now_iso_timestamp();
        let (resolved_title, is_default_title) = match title {
            Some(custom) => (custom, false),
            None => (DEFAULT_SESSION_TITLE.to_string(), true),
        };
        let document = SessionDocument {
            id: Uuid::new_v4().to_string(),
            title: resolved_title,
            is_default_title,
            pinned: false,
            created_at: now.clone(),
            updated_at: now,
            data: Map::new(),
        };
        validate_session_document(&document)?;
        let file_path = self.session_path(&document.id);
        self.queue
            .enqueue_path(&file_path, || write_json_file_atomic(&file_path, &document))?;
        Ok(document)
    }

    fn update_document<F>(&self, id: &str, change: F) -> Result<SessionDocument, SessionsError>
    where
        F: FnOnce(SessionDocument) -> SessionDocument,
    {
        let file_path = self.session_path(id);
        self.queue.enqueue_path(&file_path, || {
            let current = self.read_unlocked(id, &file_path)?;
            let updated = change(current);
            validate_session_document(&updated)?;
            write_json_file_atomic(&file_path, &updated)?;
            Ok(updated)
        })
    }

    fn try_read(&self, file_path: &Path) -> Option<SessionDocument> {
        self.queue.enqueue_path(file_path, || {
            let document = read_json_file::<SessionDocument>(file_path).ok()??;
            validate_session_document(&document).ok()?;
            Some(document)
        })
    }

    fn read_unlocked(&self, id: &str, file_path: &Path) -> Result<SessionDocument, SessionsError> {
        let document = read_json_file::<SessionDocument>(file_path)?
            .ok_or_else(|| SessionsError::NotFound(id.to_string()))?;
        validate_session_document(&document)?;
        Ok(document)
    }

    fn remove_file(&self, id: &str) -> Result<(), SessionsError> {
        let file_path = self.session_path(id);
        self.queue
            .enqueue_path(&file_path, || match fs::remove_file(&file_path) {
                Ok(()) => Ok(()),
                Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
                Err(error) => Err(SessionsError::Io(error)),
            })
    }

    fn session_path(&self, id: &str) -> PathBuf {
        self.directory_path.join(format!("{id}.json"))
    }
}

#[derive(Debug, Clone)]
pub struct SessionsService {
    repository: SessionRepository,
}

impl SessionsService {
    pub fn new(sessions_dir: PathBuf) -> Self {
        Self {
            repository: SessionRepository::new(sessions_dir),
        }
    }

    pub fn from_repository(repository: SessionRepository) -> Self {
        Self { repository }
    }

    pub fn with_queue(sessions_dir: PathBuf, queue: FileOperationQueue) -> Self {
        Self {
            repository: SessionRepository::with_queue(sessions_dir, queue),
        }
    }

    pub fn initialize(&self) -> Result<(), SessionsError> {
        self.repository.initialize()
    }

    pub fn list_sessions(&self) -> Result<Vec<SessionSummary>, SessionsError> {
        self.repository.list()
    }

    pub fn create_session(&self, title: Option<&str>) -> Result<SessionDocument, SessionsError> {
        self.repository.create(title)
    }

    pub fn get_session(&self, id: &str) -> Result<SessionDocument, SessionsError> {
        self.repository.get(id)
    }

    pub fn rename_session(&self, id: &str, title: &str) -> Result<SessionDocument, SessionsError> {
        self.repository.rename(id, title)
    }

    pub fn set_session_pinned(
        &self,
        id: &str,
        pinned: bool,
    ) -> Result<SessionDocument, SessionsError> {
        self.repository.set_pinned(id, pinned)
    }

    pub fn delete_session(&self, id: &str) -> Result<DeleteSessionResult, SessionsError> {
        self.repository.delete(id)
    }

    pub fn delete_all_sessions(&self) -> Result<SessionDocument, SessionsError> {
        self.repository.delete_all()
    }
}
