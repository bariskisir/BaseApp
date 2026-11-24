use baseapp_platform::{
    AppConfiguration, PersistedWindowState, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH,
    SideBarPosition, SidebarState, TERTIARY_DEFAULT_HEIGHT, TERTIARY_MIN_HEIGHT,
    ViewContainerLocation,
};

use super::settings::SettingsCategoryId;
use super::views::ViewDescriptorState;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum WorkbenchPage {
    #[default]
    Home,
    Settings,
}

fn normalize_sidebar_width(width: f64) -> f64 {
    if !width.is_finite() {
        return SIDEBAR_DEFAULT_WIDTH;
    }
    SIDEBAR_MIN_WIDTH.max(width.round())
}

fn normalize_tertiary_height(height: f64) -> f64 {
    if !height.is_finite() {
        return TERTIARY_DEFAULT_HEIGHT;
    }
    TERTIARY_MIN_HEIGHT.max(height.round())
}

#[derive(Debug, Clone, PartialEq)]
pub struct LayoutState {
    pub page: WorkbenchPage,
    pub settings_tab_open: bool,
    pub settings_section: SettingsCategoryId,
    pub sidebar_open: bool,
    pub sidebar_width: f64,
    pub auxiliary_open: bool,
    pub auxiliary_width: f64,
    pub tertiary_open: bool,
    pub tertiary_height: f64,
    pub compact_mode: bool,
    pub maximized: bool,
    pub fullscreen: bool,
    pub side_bar_position: SideBarPosition,
    pub status_bar_visible: bool,
}

impl Default for LayoutState {
    fn default() -> Self {
        Self {
            page: WorkbenchPage::Home,
            settings_tab_open: false,
            settings_section: SettingsCategoryId::General,
            sidebar_open: true,
            sidebar_width: SIDEBAR_DEFAULT_WIDTH,
            auxiliary_open: false,
            auxiliary_width: SIDEBAR_DEFAULT_WIDTH,
            tertiary_open: false,
            tertiary_height: TERTIARY_DEFAULT_HEIGHT,
            compact_mode: false,
            maximized: false,
            fullscreen: false,
            side_bar_position: SideBarPosition::Left,
            status_bar_visible: true,
        }
    }
}

impl LayoutState {
    pub fn from_persisted(
        window_state: Option<&PersistedWindowState>,
        config: &AppConfiguration,
    ) -> Self {
        let mut state = Self {
            side_bar_position: config.side_bar_location,
            status_bar_visible: config.status_bar_visible,
            ..Self::default()
        };

        if let Some(persisted) = window_state {
            state.maximized = persisted.maximized;
            state.fullscreen = persisted.full_screen;
            if let Some(sidebar) = persisted.sidebar {
                state.sidebar_open = sidebar.open;
                state.sidebar_width = normalize_sidebar_width(sidebar.width);
            }
            if let Some(auxiliary) = persisted.auxiliary_bar {
                state.auxiliary_open = auxiliary.open;
                state.auxiliary_width = normalize_sidebar_width(auxiliary.width);
            }
            if let Some(tertiary) = persisted.tertiary_bar {
                state.tertiary_open = tertiary.open;
                state.tertiary_height = normalize_tertiary_height(tertiary.height);
            }
            if let Some(compact_mode) = persisted.compact_mode {
                state.compact_mode = compact_mode;
            }
        }

        state
    }

    pub fn set_page(&mut self, page: WorkbenchPage) -> bool {
        let mut changed = false;
        if self.page != page {
            self.page = page;
            changed = true;
        }
        if page == WorkbenchPage::Settings && !self.settings_tab_open {
            self.settings_tab_open = true;
            changed = true;
        }
        if page != WorkbenchPage::Home && self.compact_mode {
            self.compact_mode = false;
            changed = true;
        }
        changed
    }

    pub fn open_settings(&mut self, section: Option<SettingsCategoryId>) -> bool {
        let mut changed = false;
        if let Some(target_section) = section
            && self.settings_section != target_section
        {
            self.settings_section = target_section;
            changed = true;
        }
        if self.set_page(WorkbenchPage::Settings) {
            changed = true;
        }
        changed
    }

    pub fn toggle_settings(&mut self) -> bool {
        let next = if self.page == WorkbenchPage::Settings {
            WorkbenchPage::Home
        } else {
            WorkbenchPage::Settings
        };
        self.set_page(next)
    }

    pub fn close_settings_tab(&mut self) -> bool {
        let mut changed = false;
        if self.settings_tab_open {
            self.settings_tab_open = false;
            changed = true;
        }
        if self.page == WorkbenchPage::Settings {
            self.page = WorkbenchPage::Home;
            changed = true;
        }
        changed
    }

    pub fn set_settings_section(&mut self, section: SettingsCategoryId) -> bool {
        if self.settings_section == section {
            return false;
        }
        self.settings_section = section;
        true
    }

    pub fn toggle_sidebar(&mut self) -> bool {
        self.set_sidebar_open(!self.sidebar_open)
    }

    pub fn set_sidebar_open(&mut self, open: bool) -> bool {
        if self.sidebar_open == open {
            return false;
        }
        self.sidebar_open = open;
        true
    }

    pub fn set_sidebar_width(&mut self, width: f64) -> bool {
        if !width.is_finite() {
            return false;
        }
        let normalized = normalize_sidebar_width(width);
        if (self.sidebar_width - normalized).abs() <= f64::EPSILON {
            return false;
        }
        self.sidebar_width = normalized;
        true
    }

    pub fn toggle_auxiliary_bar(&mut self) -> bool {
        self.set_auxiliary_open(!self.auxiliary_open)
    }

    pub fn set_auxiliary_open(&mut self, open: bool) -> bool {
        if self.auxiliary_open == open {
            return false;
        }
        self.auxiliary_open = open;
        true
    }

    pub fn set_auxiliary_width(&mut self, width: f64) -> bool {
        if !width.is_finite() {
            return false;
        }
        let normalized = normalize_sidebar_width(width);
        if (self.auxiliary_width - normalized).abs() <= f64::EPSILON {
            return false;
        }
        self.auxiliary_width = normalized;
        true
    }

    pub fn toggle_tertiary_bar(&mut self) -> bool {
        self.set_tertiary_open(!self.tertiary_open)
    }

    pub fn set_tertiary_open(&mut self, open: bool) -> bool {
        if self.tertiary_open == open {
            return false;
        }
        self.tertiary_open = open;
        true
    }

    pub fn set_tertiary_height(&mut self, height: f64) -> bool {
        if !height.is_finite() {
            return false;
        }
        let normalized = normalize_tertiary_height(height);
        if (self.tertiary_height - normalized).abs() <= f64::EPSILON {
            return false;
        }
        self.tertiary_height = normalized;
        true
    }

    pub fn toggle_compact_mode(&mut self) -> bool {
        self.set_compact_mode(!self.compact_mode)
    }

    pub fn set_compact_mode(&mut self, compact: bool) -> bool {
        if self.compact_mode == compact {
            return false;
        }
        self.compact_mode = compact;
        true
    }

    pub fn set_maximized(&mut self, maximized: bool) -> bool {
        if self.maximized == maximized {
            return false;
        }
        self.maximized = maximized;
        true
    }

    pub fn set_fullscreen(&mut self, fullscreen: bool) -> bool {
        if self.fullscreen == fullscreen {
            return false;
        }
        self.fullscreen = fullscreen;
        true
    }

    pub fn is_location_open(&self, location: ViewContainerLocation) -> bool {
        match location {
            ViewContainerLocation::Sidebar => self.sidebar_open,
            ViewContainerLocation::AuxiliaryBar => self.auxiliary_open,
            ViewContainerLocation::TertiaryBar => self.tertiary_open,
        }
    }

    pub fn set_location_open(&mut self, location: ViewContainerLocation, open: bool) -> bool {
        match location {
            ViewContainerLocation::Sidebar => self.set_sidebar_open(open),
            ViewContainerLocation::AuxiliaryBar => self.set_auxiliary_open(open),
            ViewContainerLocation::TertiaryBar => self.set_tertiary_open(open),
        }
    }

    pub fn is_primary_on_edge(&self, edge: SideBarPosition) -> bool {
        self.side_bar_position == edge
    }

    pub fn is_edge_sidebar_visible(&self, edge: SideBarPosition) -> bool {
        if self.compact_mode {
            return false;
        }
        if self.is_primary_on_edge(edge) {
            self.sidebar_open
        } else {
            self.auxiliary_open
        }
    }

    pub fn other_sidebar_visible_width(&self, location: ViewContainerLocation) -> f64 {
        if self.compact_mode {
            return 0.0;
        }
        match location {
            ViewContainerLocation::Sidebar => {
                if self.auxiliary_open {
                    self.auxiliary_width
                } else {
                    0.0
                }
            }
            ViewContainerLocation::AuxiliaryBar => {
                if self.sidebar_open {
                    self.sidebar_width
                } else {
                    0.0
                }
            }
            ViewContainerLocation::TertiaryBar => 0.0,
        }
    }

    pub fn reset_layout(&mut self) {
        self.sidebar_open = true;
        self.sidebar_width = SIDEBAR_DEFAULT_WIDTH;
        self.auxiliary_open = false;
        self.auxiliary_width = SIDEBAR_DEFAULT_WIDTH;
        self.tertiary_open = false;
        self.tertiary_height = TERTIARY_DEFAULT_HEIGHT;
        self.compact_mode = false;
        self.side_bar_position = SideBarPosition::Left;
        self.status_bar_visible = true;
    }

    pub fn to_sidebar_state(&self, views: &ViewDescriptorState) -> SidebarState {
        SidebarState {
            open: self.sidebar_open,
            width: self.sidebar_width,
            compact: self.compact_mode,
            auxiliary_open: Some(self.auxiliary_open),
            auxiliary_width: Some(self.auxiliary_width),
            tertiary_open: Some(self.tertiary_open),
            tertiary_height: Some(self.tertiary_height),
            view_locations: Some(views.to_persisted_locations()),
            active_primary_view_id: views
                .stored_active_view_id(ViewContainerLocation::Sidebar)
                .map(str::to_string),
            active_auxiliary_view_id: views
                .stored_active_view_id(ViewContainerLocation::AuxiliaryBar)
                .map(str::to_string),
            active_tertiary_view_id: views
                .stored_active_view_id(ViewContainerLocation::TertiaryBar)
                .map(str::to_string),
        }
    }
}
