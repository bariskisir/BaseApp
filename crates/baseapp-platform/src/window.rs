use std::collections::BTreeMap;
use std::fmt;
use std::str::FromStr;

use baseapp_base::number::clamp;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

pub const MIN_ZOOM_LEVEL: f64 = -8.0;
pub const MAX_ZOOM_LEVEL: f64 = 8.0;
pub const DEFAULT_ZOOM_LEVEL: f64 = 0.0;
pub const ZOOM_LEVEL_STEP: f64 = 1.0;

pub const DEFAULT_WINDOW_WIDTH: i32 = 1180;
pub const DEFAULT_WINDOW_HEIGHT: i32 = 760;

pub const SIDEBAR_MIN_WIDTH: f64 = 170.0;
pub const SIDEBAR_DEFAULT_WIDTH: f64 = 170.0;
pub const SIDEBAR_MIN_WORKSPACE: f64 = 360.0;

pub const TERTIARY_MIN_HEIGHT: f64 = 120.0;
pub const TERTIARY_DEFAULT_HEIGHT: f64 = 120.0;
pub const TERTIARY_MIN_WORKSPACE: f64 = 220.0;

pub const WINDOW_STATE_REVISION: u32 = 1;

fn js_round(value: f64) -> f64 {
    let rounded = (value + 0.5).floor();
    if rounded == 0.0 { 0.0 } else { rounded }
}

pub fn zoom_level_to_zoom_factor(zoom_level: f64) -> f64 {
    1.2_f64.powf(zoom_level)
}

pub fn clamp_zoom_level(level: f64) -> f64 {
    if !level.is_finite() {
        return DEFAULT_ZOOM_LEVEL;
    }
    let rounded = js_round(level * 10.0) / 10.0;
    let clamped = clamp(rounded, MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL);
    if clamped == 0.0 { 0.0 } else { clamped }
}

pub fn zoom_factor_to_zoom_level(zoom_factor: f64) -> f64 {
    if !zoom_factor.is_finite() || zoom_factor <= 0.0 {
        return DEFAULT_ZOOM_LEVEL;
    }
    clamp_zoom_level(js_round(zoom_factor.ln() / 1.2_f64.ln()))
}

pub fn get_max_sidebar_width(viewport_width: f64, other_sidebar_width: f64) -> f64 {
    let safe_viewport = if viewport_width.is_finite() {
        viewport_width.floor().max(0.0)
    } else {
        SIDEBAR_DEFAULT_WIDTH + SIDEBAR_MIN_WORKSPACE
    };
    let safe_other = if other_sidebar_width.is_finite() {
        other_sidebar_width.floor().max(0.0)
    } else {
        0.0
    };
    SIDEBAR_MIN_WIDTH.max(safe_viewport - SIDEBAR_MIN_WORKSPACE - safe_other)
}

pub fn clamp_sidebar_width(width: f64, viewport_width: f64, other_sidebar_width: f64) -> f64 {
    let normalized = if width.is_finite() {
        js_round(width)
    } else {
        SIDEBAR_DEFAULT_WIDTH
    };
    clamp(
        normalized,
        SIDEBAR_MIN_WIDTH,
        get_max_sidebar_width(viewport_width, other_sidebar_width),
    )
}

pub fn get_max_tertiary_bar_height(viewport_height: f64) -> f64 {
    let safe_viewport = if viewport_height.is_finite() {
        viewport_height.floor().max(0.0)
    } else {
        TERTIARY_DEFAULT_HEIGHT + TERTIARY_MIN_WORKSPACE
    };
    TERTIARY_MIN_HEIGHT.max(safe_viewport - TERTIARY_MIN_WORKSPACE)
}

pub fn clamp_tertiary_bar_height(height: f64, viewport_height: f64) -> f64 {
    let normalized = if height.is_finite() {
        js_round(height)
    } else {
        TERTIARY_DEFAULT_HEIGHT
    };
    clamp(
        normalized,
        TERTIARY_MIN_HEIGHT,
        get_max_tertiary_bar_height(viewport_height),
    )
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ViewContainerLocation {
    #[serde(rename = "sidebar")]
    Sidebar,
    #[serde(rename = "auxiliarybar")]
    AuxiliaryBar,
    #[serde(rename = "tertiarybar")]
    TertiaryBar,
}

impl ViewContainerLocation {
    pub const ALL: &'static [Self] = &[Self::Sidebar, Self::AuxiliaryBar, Self::TertiaryBar];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Sidebar => "sidebar",
            Self::AuxiliaryBar => "auxiliarybar",
            Self::TertiaryBar => "tertiarybar",
        }
    }
}

impl fmt::Display for ViewContainerLocation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for ViewContainerLocation {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "sidebar" => Ok(Self::Sidebar),
            "auxiliarybar" => Ok(Self::AuxiliaryBar),
            "tertiarybar" => Ok(Self::TertiaryBar),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub enum SideBarPosition {
    #[default]
    #[serde(rename = "left")]
    Left,
    #[serde(rename = "right")]
    Right,
}

impl SideBarPosition {
    pub const ALL: &'static [Self] = &[Self::Left, Self::Right];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Left => "left",
            Self::Right => "right",
        }
    }
}

impl fmt::Display for SideBarPosition {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for SideBarPosition {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "left" => Ok(Self::Left),
            "right" => Ok(Self::Right),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

impl Default for WindowBounds {
    fn default() -> Self {
        Self {
            x: 0,
            y: 0,
            width: DEFAULT_WINDOW_WIDTH,
            height: DEFAULT_WINDOW_HEIGHT,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayWorkArea {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedSidebarState {
    pub open: bool,
    pub width: f64,
}

impl PersistedSidebarState {
    pub const fn default_primary() -> Self {
        Self {
            open: true,
            width: SIDEBAR_DEFAULT_WIDTH,
        }
    }

    pub const fn default_auxiliary() -> Self {
        Self {
            open: false,
            width: SIDEBAR_DEFAULT_WIDTH,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedTertiaryBarState {
    pub open: bool,
    pub height: f64,
}

impl Default for PersistedTertiaryBarState {
    fn default() -> Self {
        Self {
            open: false,
            height: TERTIARY_DEFAULT_HEIGHT,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidebarState {
    pub open: bool,
    pub width: f64,
    pub compact: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auxiliary_open: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auxiliary_width: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tertiary_open: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tertiary_height: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub view_locations: Option<BTreeMap<String, ViewContainerLocation>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_primary_view_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_auxiliary_view_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_tertiary_view_id: Option<String>,
}

impl Default for SidebarState {
    fn default() -> Self {
        Self {
            open: true,
            width: SIDEBAR_DEFAULT_WIDTH,
            compact: false,
            auxiliary_open: Some(false),
            auxiliary_width: Some(SIDEBAR_DEFAULT_WIDTH),
            tertiary_open: Some(false),
            tertiary_height: Some(TERTIARY_DEFAULT_HEIGHT),
            view_locations: None,
            active_primary_view_id: None,
            active_auxiliary_view_id: None,
            active_tertiary_view_id: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedWindowState {
    pub revision: u32,
    pub bounds: WindowBounds,
    pub maximized: bool,
    pub full_screen: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sidebar: Option<PersistedSidebarState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auxiliary_bar: Option<PersistedSidebarState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tertiary_bar: Option<PersistedTertiaryBarState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compact_mode: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub view_locations: Option<BTreeMap<String, ViewContainerLocation>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_primary_view_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_auxiliary_view_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_tertiary_view_id: Option<String>,
}

impl Default for PersistedWindowState {
    fn default() -> Self {
        Self {
            revision: WINDOW_STATE_REVISION,
            bounds: WindowBounds::default(),
            maximized: false,
            full_screen: false,
            sidebar: Some(PersistedSidebarState::default_primary()),
            auxiliary_bar: Some(PersistedSidebarState::default_auxiliary()),
            tertiary_bar: Some(PersistedTertiaryBarState::default()),
            compact_mode: Some(false),
            active_session_id: None,
            view_locations: None,
            active_primary_view_id: None,
            active_auxiliary_view_id: None,
            active_tertiary_view_id: None,
        }
    }
}

fn is_hyphenated_uuid(value: &str) -> bool {
    value.len() == 36
        && value.as_bytes().get(8) == Some(&b'-')
        && value.as_bytes().get(13) == Some(&b'-')
        && value.as_bytes().get(18) == Some(&b'-')
        && value.as_bytes().get(23) == Some(&b'-')
        && Uuid::parse_str(value).is_ok()
}

fn parse_strict_i32_in_range(value: &Value, min: i32, max: i32) -> Option<i32> {
    let number = value.as_i64()?;
    let int_value = i32::try_from(number).ok()?;
    if (min..=max).contains(&int_value) {
        Some(int_value)
    } else {
        None
    }
}

fn parse_finite_f64_in_range(value: &Value, min: f64, max: f64) -> Option<f64> {
    let number = value.as_f64()?;
    if number.is_finite() && (min..=max).contains(&number) {
        Some(number)
    } else {
        None
    }
}

fn parse_view_id(value: &Value) -> Option<String> {
    let text = value.as_str()?;
    let char_count = text.chars().count();
    if (1..=128).contains(&char_count) {
        Some(text.to_string())
    } else {
        None
    }
}

fn parse_persisted_sidebar(value: &Value) -> Option<PersistedSidebarState> {
    let object = value.as_object()?;
    let open = object.get("open")?.as_bool()?;
    let width = parse_finite_f64_in_range(object.get("width")?, 1.0, 100_000.0)?;
    Some(PersistedSidebarState { open, width })
}

fn parse_persisted_tertiary(value: &Value) -> Option<PersistedTertiaryBarState> {
    let object = value.as_object()?;
    let open = object.get("open")?.as_bool()?;
    let height = parse_finite_f64_in_range(object.get("height")?, 1.0, 100_000.0)?;
    Some(PersistedTertiaryBarState { open, height })
}

fn parse_view_locations(value: &Value) -> Option<BTreeMap<String, ViewContainerLocation>> {
    let object = value.as_object()?;
    let mut locations = BTreeMap::new();
    for (key, entry_value) in object {
        let char_count = key.chars().count();
        if !(1..=128).contains(&char_count) {
            return None;
        }
        let target_str = entry_value.as_str()?;
        let location = ViewContainerLocation::from_str(target_str).ok()?;
        locations.insert(key.clone(), location);
    }
    Some(locations)
}

pub fn parse_persisted_window_state(input: &Value) -> Option<PersistedWindowState> {
    let object = input.as_object()?;
    let revision_value = object.get("revision")?;
    if revision_value.as_u64() != Some(u64::from(WINDOW_STATE_REVISION)) {
        return None;
    }

    let bounds_object = object.get("bounds")?.as_object()?;
    let bounds = WindowBounds {
        x: parse_strict_i32_in_range(bounds_object.get("x")?, -100_000, 100_000)?,
        y: parse_strict_i32_in_range(bounds_object.get("y")?, -100_000, 100_000)?,
        width: parse_strict_i32_in_range(bounds_object.get("width")?, 1, 100_000)?,
        height: parse_strict_i32_in_range(bounds_object.get("height")?, 1, 100_000)?,
    };

    let maximized = object.get("maximized")?.as_bool()?;
    let full_screen = object.get("fullScreen")?.as_bool()?;

    let sidebar = match object.get("sidebar") {
        Some(value) => Some(parse_persisted_sidebar(value)?),
        None => None,
    };
    let auxiliary_bar = match object.get("auxiliaryBar") {
        Some(value) => Some(parse_persisted_sidebar(value)?),
        None => None,
    };
    let tertiary_bar = match object.get("tertiaryBar") {
        Some(value) => Some(parse_persisted_tertiary(value)?),
        None => None,
    };
    let compact_mode = match object.get("compactMode") {
        Some(value) => Some(value.as_bool()?),
        None => None,
    };
    let active_session_id = match object.get("activeSessionId") {
        Some(value) => {
            let id = value.as_str()?;
            if !is_hyphenated_uuid(id) {
                return None;
            }
            Some(id.to_string())
        }
        None => None,
    };
    let view_locations = match object.get("viewLocations") {
        Some(value) => Some(parse_view_locations(value)?),
        None => None,
    };
    let active_primary_view_id = match object.get("activePrimaryViewId") {
        Some(value) => Some(parse_view_id(value)?),
        None => None,
    };
    let active_auxiliary_view_id = match object.get("activeAuxiliaryViewId") {
        Some(value) => Some(parse_view_id(value)?),
        None => None,
    };
    let active_tertiary_view_id = match object.get("activeTertiaryViewId") {
        Some(value) => Some(parse_view_id(value)?),
        None => None,
    };

    Some(PersistedWindowState {
        revision: WINDOW_STATE_REVISION,
        bounds,
        maximized,
        full_screen,
        sidebar,
        auxiliary_bar,
        tertiary_bar,
        compact_mode,
        active_session_id,
        view_locations,
        active_primary_view_id,
        active_auxiliary_view_id,
        active_tertiary_view_id,
    })
}

fn intersection_area(bounds: &WindowBounds, work_area: &DisplayWorkArea) -> i64 {
    let left_x = i64::from(bounds.x);
    let left_y = i64::from(bounds.y);
    let left_right = left_x + i64::from(bounds.width);
    let left_bottom = left_y + i64::from(bounds.height);

    let right_x = i64::from(work_area.x);
    let right_y = i64::from(work_area.y);
    let right_right = right_x + i64::from(work_area.width);
    let right_bottom = right_y + i64::from(work_area.height);

    let width = (left_right.min(right_right) - left_x.max(right_x)).max(0);
    let height = (left_bottom.min(right_bottom) - left_y.max(right_y)).max(0);
    width * height
}

pub fn fit_window_bounds_to_displays(
    bounds: &WindowBounds,
    work_areas: &[DisplayWorkArea],
) -> Option<WindowBounds> {
    let mut best_work_area: Option<&DisplayWorkArea> = None;
    let mut best_intersection: i64 = 0;

    for work_area in work_areas {
        let area = intersection_area(bounds, work_area);
        if area <= best_intersection {
            continue;
        }
        best_intersection = area;
        best_work_area = Some(work_area);
    }

    let target = best_work_area?;
    let width = bounds.width.min(target.width);
    let height = bounds.height.min(target.height);
    let max_x = target.x.saturating_add(target.width.saturating_sub(width));
    let max_y = target
        .y
        .saturating_add(target.height.saturating_sub(height));

    Some(WindowBounds {
        x: bounds.x.clamp(target.x, max_x),
        y: bounds.y.clamp(target.y, max_y),
        width,
        height,
    })
}
