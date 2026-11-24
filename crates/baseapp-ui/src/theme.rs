use baseapp_base::Color;
use baseapp_platform::{ResolvedThemeMode, ShellMetrics, ThemePalette, zoom_level_to_zoom_factor};
use gpui::{App, Global, Hsla, Pixels, Rems, Rgba, px, rems};

#[cfg(target_os = "windows")]
pub const UI_FONT_FAMILY: &str = "Segoe UI";
#[cfg(target_os = "macos")]
pub const UI_FONT_FAMILY: &str = ".AppleSystemUIFont";
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub const UI_FONT_FAMILY: &str = "Ubuntu";

#[cfg(target_os = "windows")]
pub const MONO_FONT_FAMILY: &str = "Cascadia Code";
#[cfg(target_os = "macos")]
pub const MONO_FONT_FAMILY: &str = "Menlo";
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub const MONO_FONT_FAMILY: &str = "DejaVu Sans Mono";

pub fn color_to_rgba(color: Color) -> Rgba {
    let [r, g, b, a] = color.to_f32_rgba();
    Rgba { r, g, b, a }
}

pub fn color_to_hsla(color: Color) -> Hsla {
    Hsla::from(color_to_rgba(color))
}

pub fn rem_px(px_at_100: f32) -> Rems {
    rems(px_at_100 / 16.0)
}

pub fn scaled_rem_size(zoom_level: f64) -> Pixels {
    px((16.0 * zoom_level_to_zoom_factor(zoom_level)) as f32)
}

#[derive(Clone, Debug)]
pub struct ActiveTheme {
    pub mode: ResolvedThemeMode,
    pub palette: ThemePalette,
    pub metrics: ShellMetrics,
}

impl Global for ActiveTheme {}

impl Default for ActiveTheme {
    fn default() -> Self {
        Self::for_mode(ResolvedThemeMode::Dark)
    }
}

impl ActiveTheme {
    pub fn for_mode(mode: ResolvedThemeMode) -> Self {
        Self {
            mode,
            palette: ThemePalette::for_mode(mode),
            metrics: ShellMetrics::default(),
        }
    }

    pub fn current(cx: &App) -> Self {
        cx.try_global::<Self>().cloned().unwrap_or_default()
    }

    pub fn set(cx: &mut App, mode: ResolvedThemeMode) {
        cx.set_global(Self::for_mode(mode));
    }

    pub fn hsla(color: Color) -> Hsla {
        color_to_hsla(color)
    }

    pub fn rgba(color: Color) -> Rgba {
        color_to_rgba(color)
    }

    pub fn color(&self, token: &str) -> Option<Hsla> {
        self.palette.color_by_token(token).map(color_to_hsla)
    }

    pub fn foreground(&self) -> Hsla {
        color_to_hsla(self.palette.foreground)
    }

    pub fn description_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.description_foreground)
    }

    pub fn focus_border(&self) -> Hsla {
        color_to_hsla(self.palette.focus_border)
    }

    pub fn icon_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.icon_foreground)
    }

    pub fn border_default(&self) -> Hsla {
        color_to_hsla(self.palette.border_default)
    }

    pub fn widget_shadow(&self) -> Hsla {
        color_to_hsla(self.palette.widget_shadow)
    }

    pub fn selection_background(&self) -> Hsla {
        color_to_hsla(self.palette.selection_background)
    }

    pub fn text_link_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.text_link_foreground)
    }

    pub fn text_link_active_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.text_link_active_foreground)
    }

    pub fn badge_background(&self) -> Hsla {
        color_to_hsla(self.palette.badge_background)
    }

    pub fn badge_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.badge_foreground)
    }

    pub fn toolbar_hover_background(&self) -> Hsla {
        color_to_hsla(self.palette.toolbar_hover_background)
    }

    pub fn toolbar_active_background(&self) -> Hsla {
        color_to_hsla(self.palette.toolbar_active_background)
    }

    pub fn button_background(&self) -> Hsla {
        color_to_hsla(self.palette.button_background)
    }

    pub fn button_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.button_foreground)
    }

    pub fn button_hover_background(&self) -> Hsla {
        color_to_hsla(self.palette.button_hover_background)
    }

    pub fn button_border(&self) -> Hsla {
        color_to_hsla(self.palette.button_border)
    }

    pub fn button_secondary_background(&self) -> Hsla {
        color_to_hsla(self.palette.button_secondary_background)
    }

    pub fn button_secondary_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.button_secondary_foreground)
    }

    pub fn button_secondary_hover_background(&self) -> Hsla {
        color_to_hsla(self.palette.button_secondary_hover_background)
    }

    pub fn button_danger_background(&self) -> Hsla {
        color_to_hsla(self.palette.button_danger_background)
    }

    pub fn button_danger_hover_background(&self) -> Hsla {
        color_to_hsla(self.palette.button_danger_hover_background)
    }

    pub fn input_background(&self) -> Hsla {
        color_to_hsla(self.palette.input_background)
    }

    pub fn input_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.input_foreground)
    }

    pub fn input_border(&self) -> Hsla {
        color_to_hsla(self.palette.input_border)
    }

    pub fn input_placeholder_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.input_placeholder_foreground)
    }

    pub fn input_option_active_background(&self) -> Hsla {
        color_to_hsla(self.palette.input_option_active_background)
    }

    pub fn input_option_active_border(&self) -> Hsla {
        color_to_hsla(self.palette.input_option_active_border)
    }

    pub fn input_option_active_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.input_option_active_foreground)
    }

    pub fn checkbox_background(&self) -> Hsla {
        color_to_hsla(self.palette.checkbox_background)
    }

    pub fn checkbox_border(&self) -> Hsla {
        color_to_hsla(self.palette.checkbox_border)
    }

    pub fn checkbox_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.checkbox_foreground)
    }

    pub fn dropdown_background(&self) -> Hsla {
        color_to_hsla(self.palette.dropdown_background)
    }

    pub fn dropdown_border(&self) -> Hsla {
        color_to_hsla(self.palette.dropdown_border)
    }

    pub fn dropdown_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.dropdown_foreground)
    }

    pub fn dropdown_list_background(&self) -> Hsla {
        color_to_hsla(self.palette.dropdown_list_background)
    }

    pub fn list_active_selection_background(&self) -> Hsla {
        color_to_hsla(self.palette.list_active_selection_background)
    }

    pub fn list_active_selection_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.list_active_selection_foreground)
    }

    pub fn list_inactive_selection_background(&self) -> Hsla {
        color_to_hsla(self.palette.list_inactive_selection_background)
    }

    pub fn list_inactive_selection_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.list_inactive_selection_foreground)
    }

    pub fn list_hover_background(&self) -> Hsla {
        color_to_hsla(self.palette.list_hover_background)
    }

    pub fn menu_background(&self) -> Hsla {
        color_to_hsla(self.palette.menu_background)
    }

    pub fn menu_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.menu_foreground)
    }

    pub fn menu_border(&self) -> Hsla {
        color_to_hsla(self.palette.menu_border)
    }

    pub fn menu_separator_background(&self) -> Hsla {
        color_to_hsla(self.palette.menu_separator_background)
    }

    pub fn menu_selection_background(&self) -> Hsla {
        color_to_hsla(self.palette.menu_selection_background)
    }

    pub fn menu_selection_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.menu_selection_foreground)
    }

    pub fn sash_hover_border(&self) -> Hsla {
        color_to_hsla(self.palette.sash_hover_border)
    }

    pub fn progress_bar_background(&self) -> Hsla {
        color_to_hsla(self.palette.progress_bar_background)
    }

    pub fn dialog_background(&self) -> Hsla {
        color_to_hsla(self.palette.dialog_background)
    }

    pub fn dialog_border(&self) -> Hsla {
        color_to_hsla(self.palette.dialog_border)
    }

    pub fn tooltip_background(&self) -> Hsla {
        color_to_hsla(self.palette.tooltip_background)
    }

    pub fn tooltip_border(&self) -> Hsla {
        color_to_hsla(self.palette.tooltip_border)
    }

    pub fn accent_primary(&self) -> Hsla {
        color_to_hsla(self.palette.accent_primary)
    }

    pub fn accent_primary_hover(&self) -> Hsla {
        color_to_hsla(self.palette.accent_primary_hover)
    }

    pub fn session_accent(&self) -> Hsla {
        color_to_hsla(self.palette.session_accent)
    }

    pub fn error_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.error_foreground)
    }

    pub fn warning_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.warning_foreground)
    }

    pub fn info_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.info_foreground)
    }

    pub fn success_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.success_foreground)
    }

    pub fn scrollbar_slider_background(&self) -> Hsla {
        color_to_hsla(self.palette.scrollbar_slider_background)
    }

    pub fn scrollbar_slider_hover_background(&self) -> Hsla {
        color_to_hsla(self.palette.scrollbar_slider_hover_background)
    }

    pub fn scrollbar_slider_active_background(&self) -> Hsla {
        color_to_hsla(self.palette.scrollbar_slider_active_background)
    }

    pub fn editor_background(&self) -> Hsla {
        color_to_hsla(self.palette.editor_background)
    }

    pub fn editor_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.editor_foreground)
    }

    pub fn editor_widget_background(&self) -> Hsla {
        color_to_hsla(self.palette.editor_widget_background)
    }

    pub fn workbench_background(&self) -> Hsla {
        color_to_hsla(self.palette.workbench_background)
    }

    pub fn title_bar_active_background(&self) -> Hsla {
        color_to_hsla(self.palette.title_bar_active_background)
    }

    pub fn title_bar_active_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.title_bar_active_foreground)
    }

    pub fn title_bar_border(&self) -> Hsla {
        color_to_hsla(self.palette.title_bar_border)
    }

    pub fn side_bar_background(&self) -> Hsla {
        color_to_hsla(self.palette.side_bar_background)
    }

    pub fn side_bar_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.side_bar_foreground)
    }

    pub fn side_bar_border(&self) -> Hsla {
        color_to_hsla(self.palette.side_bar_border)
    }

    pub fn side_bar_active_border(&self) -> Hsla {
        color_to_hsla(self.palette.side_bar_active_border)
    }

    pub fn side_bar_title_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.side_bar_title_foreground)
    }

    pub fn side_bar_drop_background(&self) -> Hsla {
        color_to_hsla(self.palette.side_bar_drop_background)
    }

    pub fn status_bar_background(&self) -> Hsla {
        color_to_hsla(self.palette.status_bar_background)
    }

    pub fn status_bar_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.status_bar_foreground)
    }

    pub fn status_bar_border(&self) -> Hsla {
        color_to_hsla(self.palette.status_bar_border)
    }

    pub fn status_bar_item_hover_background(&self) -> Hsla {
        color_to_hsla(self.palette.status_bar_item_hover_background)
    }

    pub fn status_bar_item_hover_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.status_bar_item_hover_foreground)
    }

    pub fn status_bar_item_prominent_background(&self) -> Hsla {
        color_to_hsla(self.palette.status_bar_item_prominent_background)
    }

    pub fn status_bar_item_prominent_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.status_bar_item_prominent_foreground)
    }

    pub fn status_bar_item_prominent_hover_background(&self) -> Hsla {
        color_to_hsla(self.palette.status_bar_item_prominent_hover_background)
    }

    pub fn tab_active_background(&self) -> Hsla {
        color_to_hsla(self.palette.tab_active_background)
    }

    pub fn tab_active_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.tab_active_foreground)
    }

    pub fn tab_active_border_top(&self) -> Hsla {
        color_to_hsla(self.palette.tab_active_border_top)
    }

    pub fn tab_inactive_background(&self) -> Hsla {
        color_to_hsla(self.palette.tab_inactive_background)
    }

    pub fn tab_inactive_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.tab_inactive_foreground)
    }

    pub fn tab_border(&self) -> Hsla {
        color_to_hsla(self.palette.tab_border)
    }

    pub fn tab_hover_background(&self) -> Hsla {
        color_to_hsla(self.palette.tab_hover_background)
    }

    pub fn editor_group_header_tabs_background(&self) -> Hsla {
        color_to_hsla(self.palette.editor_group_header_tabs_background)
    }

    pub fn editor_group_header_tabs_border(&self) -> Hsla {
        color_to_hsla(self.palette.editor_group_header_tabs_border)
    }

    pub fn settings_header_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.settings_header_foreground)
    }

    pub fn settings_row_hover_background(&self) -> Hsla {
        color_to_hsla(self.palette.settings_row_hover_background)
    }

    pub fn settings_modified_item_indicator(&self) -> Hsla {
        color_to_hsla(self.palette.settings_modified_item_indicator)
    }

    pub fn notifications_background(&self) -> Hsla {
        color_to_hsla(self.palette.notifications_background)
    }

    pub fn notifications_foreground(&self) -> Hsla {
        color_to_hsla(self.palette.notifications_foreground)
    }

    pub fn notifications_border(&self) -> Hsla {
        color_to_hsla(self.palette.notifications_border)
    }

    pub fn welcome_page_tile_background(&self) -> Hsla {
        color_to_hsla(self.palette.welcome_page_tile_background)
    }

    pub fn welcome_page_tile_hover_background(&self) -> Hsla {
        color_to_hsla(self.palette.welcome_page_tile_hover_background)
    }
}
