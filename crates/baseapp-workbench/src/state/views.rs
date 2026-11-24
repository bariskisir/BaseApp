use std::collections::BTreeMap;

use baseapp_platform::{PersistedWindowState, ViewContainerLocation};
use baseapp_ui::Codicon;

pub const SESSIONS_VIEW_ID: &str = "workbench.view.sessions";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ViewDescriptor {
    pub id: &'static str,
    pub title_key: &'static str,
    pub icon: Codicon,
    pub default_location: ViewContainerLocation,
    pub can_move_view: bool,
    pub order: i32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ViewDescriptorState {
    views: Vec<ViewDescriptor>,
    location_overrides: BTreeMap<String, ViewContainerLocation>,
    active_primary_view_id: Option<String>,
    active_auxiliary_view_id: Option<String>,
    active_tertiary_view_id: Option<String>,
}

impl Default for ViewDescriptorState {
    fn default() -> Self {
        Self::new()
    }
}

impl ViewDescriptorState {
    pub fn new() -> Self {
        let mut state = Self {
            views: Vec::new(),
            location_overrides: BTreeMap::new(),
            active_primary_view_id: None,
            active_auxiliary_view_id: None,
            active_tertiary_view_id: None,
        };
        state.register_view(ViewDescriptor {
            id: SESSIONS_VIEW_ID,
            title_key: "nav.sessions",
            icon: Codicon::Files,
            default_location: ViewContainerLocation::Sidebar,
            can_move_view: true,
            order: 0,
        });
        state
    }

    pub fn from_persisted(window_state: Option<&PersistedWindowState>) -> Self {
        let mut state = Self::new();
        if let Some(persisted) = window_state {
            state.restore_from_persisted(persisted);
        }
        state
    }

    pub fn restore_from_persisted(&mut self, window_state: &PersistedWindowState) {
        self.location_overrides = window_state.view_locations.clone().unwrap_or_default();
        self.active_primary_view_id = window_state.active_primary_view_id.clone();
        self.active_auxiliary_view_id = window_state.active_auxiliary_view_id.clone();
        self.active_tertiary_view_id = window_state.active_tertiary_view_id.clone();
    }

    pub fn register_view(&mut self, descriptor: ViewDescriptor) {
        if descriptor.id.trim().is_empty() {
            return;
        }
        if let Some(existing) = self.views.iter_mut().find(|item| item.id == descriptor.id) {
            *existing = descriptor;
        } else {
            self.views.push(descriptor);
        }
        self.views
            .sort_by(|left, right| left.order.cmp(&right.order).then(left.id.cmp(right.id)));
    }

    pub fn views(&self) -> &[ViewDescriptor] {
        &self.views
    }

    pub fn view(&self, view_id: &str) -> Option<&ViewDescriptor> {
        self.views
            .iter()
            .find(|descriptor| descriptor.id == view_id)
    }

    pub fn views_by_location(&self, location: ViewContainerLocation) -> Vec<&ViewDescriptor> {
        self.views
            .iter()
            .filter(|descriptor| self.resolve_location(descriptor) == location)
            .collect()
    }

    pub fn view_location(&self, view_id: &str) -> Option<ViewContainerLocation> {
        let descriptor = self.view(view_id)?;
        Some(self.resolve_location(descriptor))
    }

    pub fn active_view_id(&self, location: ViewContainerLocation) -> Option<&str> {
        let views = self.views_by_location(location);
        if views.is_empty() {
            return None;
        }
        if let Some(stored) = self.stored_active_view_id(location)
            && views.iter().any(|view| view.id == stored)
        {
            return Some(stored);
        }
        views.first().map(|view| view.id)
    }

    pub fn stored_active_view_id(&self, location: ViewContainerLocation) -> Option<&str> {
        match location {
            ViewContainerLocation::Sidebar => self.active_primary_view_id.as_deref(),
            ViewContainerLocation::AuxiliaryBar => self.active_auxiliary_view_id.as_deref(),
            ViewContainerLocation::TertiaryBar => self.active_tertiary_view_id.as_deref(),
        }
    }

    pub fn set_active_view_id(&mut self, location: ViewContainerLocation, view_id: &str) -> bool {
        let views = self.views_by_location(location);
        if !views.iter().any(|view| view.id == view_id) {
            return false;
        }
        if self.stored_active_view_id(location) == Some(view_id) {
            return false;
        }
        self.set_stored_active_view_id(location, Some(view_id.to_string()));
        true
    }

    pub fn move_view_to_location(&mut self, view_id: &str, target: ViewContainerLocation) -> bool {
        let Some(descriptor) = self.view(view_id).cloned() else {
            return false;
        };
        if !descriptor.can_move_view {
            return false;
        }

        let current_location = self.resolve_location(&descriptor);
        if current_location == target {
            self.set_stored_active_view_id(target, Some(view_id.to_string()));
            return false;
        }

        if target == descriptor.default_location {
            self.location_overrides.remove(view_id);
        } else {
            self.location_overrides.insert(view_id.to_string(), target);
        }

        self.set_stored_active_view_id(target, Some(view_id.to_string()));

        let remaining_first_id = self
            .views_by_location(current_location)
            .first()
            .map(|view| view.id.to_string());
        match remaining_first_id {
            None => {
                self.set_stored_active_view_id(current_location, None);
            }
            Some(fallback_id) => {
                if self.stored_active_view_id(current_location) == Some(view_id) {
                    self.set_stored_active_view_id(current_location, Some(fallback_id));
                }
            }
        }

        true
    }

    pub fn open_view(&mut self, view_id: &str) -> Option<ViewContainerLocation> {
        let location = self.view_location(view_id)?;
        self.set_stored_active_view_id(location, Some(view_id.to_string()));
        Some(location)
    }

    pub fn reset_view_locations(&mut self) -> bool {
        let had_state = !self.location_overrides.is_empty()
            || self.active_primary_view_id.is_some()
            || self.active_auxiliary_view_id.is_some()
            || self.active_tertiary_view_id.is_some();
        if !had_state {
            return false;
        }
        self.location_overrides.clear();
        self.active_primary_view_id = None;
        self.active_auxiliary_view_id = None;
        self.active_tertiary_view_id = None;
        true
    }

    pub fn to_persisted_locations(&self) -> BTreeMap<String, ViewContainerLocation> {
        self.location_overrides.clone()
    }

    fn resolve_location(&self, descriptor: &ViewDescriptor) -> ViewContainerLocation {
        self.location_overrides
            .get(descriptor.id)
            .copied()
            .unwrap_or(descriptor.default_location)
    }

    fn set_stored_active_view_id(
        &mut self,
        location: ViewContainerLocation,
        view_id: Option<String>,
    ) {
        match location {
            ViewContainerLocation::Sidebar => self.active_primary_view_id = view_id,
            ViewContainerLocation::AuxiliaryBar => self.active_auxiliary_view_id = view_id,
            ViewContainerLocation::TertiaryBar => self.active_tertiary_view_id = view_id,
        }
    }
}
