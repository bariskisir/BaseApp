use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use baseapp_base::fs::{
    AtomicFileError, FileOperationQueue, read_json_value, remove_interrupted_writes,
    write_json_file_atomic,
};

use crate::window::{
    PersistedSidebarState, PersistedTertiaryBarState, PersistedWindowState, SidebarState,
    ViewContainerLocation, WINDOW_STATE_REVISION, WindowBounds, parse_persisted_window_state,
};

const LEGACY_WINDOW_STATE_KEY: &str = "window.state";

#[derive(Debug, Clone)]
pub struct WindowStateStore {
    path: PathBuf,
    queue: FileOperationQueue,
}

impl WindowStateStore {
    pub fn new(path: PathBuf) -> Self {
        Self::with_queue(path, FileOperationQueue::new())
    }

    pub fn with_queue(path: PathBuf, queue: FileOperationQueue) -> Self {
        Self { path, queue }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn cleanup_interrupted_writes(&self) -> Result<usize, AtomicFileError> {
        match self.path.parent() {
            Some(parent) if !parent.as_os_str().is_empty() => remove_interrupted_writes(parent),
            _ => Ok(0),
        }
    }

    pub fn load(&self) -> Result<Option<PersistedWindowState>, AtomicFileError> {
        self.queue.enqueue_path(&self.path, || self.load_unlocked())
    }

    pub fn save(&self, state: &PersistedWindowState) -> Result<(), AtomicFileError> {
        self.queue
            .enqueue_path(&self.path, || write_json_file_atomic(&self.path, state))
    }

    pub fn update<F>(&self, updater: F) -> Result<PersistedWindowState, AtomicFileError>
    where
        F: FnOnce(&mut PersistedWindowState),
    {
        self.queue.enqueue_path(&self.path, || {
            let mut state = self.load_unlocked()?.unwrap_or_default();
            updater(&mut state);
            state.revision = WINDOW_STATE_REVISION;
            write_json_file_atomic(&self.path, &state)?;
            Ok(state)
        })
    }

    pub fn update_bounds(
        &self,
        bounds: WindowBounds,
        maximized: bool,
        full_screen: bool,
    ) -> Result<PersistedWindowState, AtomicFileError> {
        self.update(|state| {
            state.bounds = bounds;
            state.maximized = maximized;
            state.full_screen = full_screen;
        })
    }

    pub fn update_sidebar(
        &self,
        sidebar: PersistedSidebarState,
    ) -> Result<PersistedWindowState, AtomicFileError> {
        self.update(|state| {
            state.sidebar = Some(sidebar);
        })
    }

    pub fn update_auxiliary_bar(
        &self,
        auxiliary_bar: PersistedSidebarState,
    ) -> Result<PersistedWindowState, AtomicFileError> {
        self.update(|state| {
            state.auxiliary_bar = Some(auxiliary_bar);
        })
    }

    pub fn update_tertiary_bar(
        &self,
        tertiary_bar: PersistedTertiaryBarState,
    ) -> Result<PersistedWindowState, AtomicFileError> {
        self.update(|state| {
            state.tertiary_bar = Some(tertiary_bar);
        })
    }

    pub fn update_sidebar_state(
        &self,
        sidebar_state: &SidebarState,
    ) -> Result<PersistedWindowState, AtomicFileError> {
        self.update(|state| {
            state.sidebar = Some(PersistedSidebarState {
                open: sidebar_state.open,
                width: sidebar_state.width,
            });
            let default_aux = PersistedSidebarState::default_auxiliary();
            state.auxiliary_bar = Some(PersistedSidebarState {
                open: sidebar_state
                    .auxiliary_open
                    .or(state.auxiliary_bar.map(|bar| bar.open))
                    .unwrap_or(default_aux.open),
                width: sidebar_state
                    .auxiliary_width
                    .or(state.auxiliary_bar.map(|bar| bar.width))
                    .unwrap_or(default_aux.width),
            });
            let default_tertiary = PersistedTertiaryBarState::default();
            state.tertiary_bar = Some(PersistedTertiaryBarState {
                open: sidebar_state
                    .tertiary_open
                    .or(state.tertiary_bar.map(|bar| bar.open))
                    .unwrap_or(default_tertiary.open),
                height: sidebar_state
                    .tertiary_height
                    .or(state.tertiary_bar.map(|bar| bar.height))
                    .unwrap_or(default_tertiary.height),
            });
            state.compact_mode = Some(sidebar_state.compact);
            if let Some(view_locations) = &sidebar_state.view_locations {
                state.view_locations = Some(view_locations.clone());
            }
            if let Some(view_id) = &sidebar_state.active_primary_view_id {
                state.active_primary_view_id = Some(view_id.clone());
            }
            if let Some(view_id) = &sidebar_state.active_auxiliary_view_id {
                state.active_auxiliary_view_id = Some(view_id.clone());
            }
            if let Some(view_id) = &sidebar_state.active_tertiary_view_id {
                state.active_tertiary_view_id = Some(view_id.clone());
            }
        })
    }

    pub fn update_view_locations(
        &self,
        view_locations: BTreeMap<String, ViewContainerLocation>,
    ) -> Result<PersistedWindowState, AtomicFileError> {
        self.update(|state| {
            state.view_locations = Some(view_locations);
        })
    }

    pub fn update_active_session_id(
        &self,
        active_session_id: Option<String>,
    ) -> Result<PersistedWindowState, AtomicFileError> {
        self.update(|state| {
            state.active_session_id = active_session_id;
        })
    }

    pub fn reset_layout(
        &self,
        bounds: WindowBounds,
    ) -> Result<PersistedWindowState, AtomicFileError> {
        self.update(|state| {
            let preserved_session = state.active_session_id.clone();
            *state = PersistedWindowState {
                bounds,
                active_session_id: preserved_session,
                ..PersistedWindowState::default()
            };
        })
    }

    fn load_unlocked(&self) -> Result<Option<PersistedWindowState>, AtomicFileError> {
        let Some(value) = read_json_value(&self.path)? else {
            return Ok(None);
        };
        if let Some(parsed) = parse_persisted_window_state(&value) {
            return Ok(Some(parsed));
        }
        Ok(value
            .get(LEGACY_WINDOW_STATE_KEY)
            .and_then(parse_persisted_window_state))
    }
}
