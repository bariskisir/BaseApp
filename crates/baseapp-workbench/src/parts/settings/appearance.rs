use baseapp_platform::{
    AppConfiguration, AppConfigurationPatch, DEFAULT_ZOOM_LEVEL, MAX_ZOOM_LEVEL, MIN_ZOOM_LEVEL,
    SideBarPosition, ThemeMode, clamp_window_opacity, snap_window_opacity,
    zoom_level_to_zoom_factor,
};
use baseapp_ui::{
    ActiveTheme, Button, Checkbox, Codicon, MONO_FONT_FAMILY, SegmentedControl, SegmentedOption,
    Slider, rem_px,
};
use gpui::{App, Entity, div, prelude::*};

use crate::{SettingsCategoryId, WorkbenchState};

use super::common::{CategoryContent, SettingItemBuilder, SettingItemLayout, SettingsGroupSection};

fn format_zoom_display(level: f64) -> String {
    let rounded = level.round() as i32;
    let signed = if rounded > 0 {
        format!("+{rounded}")
    } else {
        rounded.to_string()
    };
    let percent = (zoom_level_to_zoom_factor(level) * 100.0).round() as i32;
    format!("{signed} ({percent}%)")
}

fn opacity_to_percent(opacity: f64) -> f64 {
    (clamp_window_opacity(opacity) * 100.0).round()
}

pub fn build_appearance_category(
    state_entity: &Entity<WorkbenchState>,
    theme: &ActiveTheme,
    cx: &App,
) -> CategoryContent {
    let state = state_entity.read(cx);
    let config = state.config();
    let defaults = AppConfiguration::default();
    let category_label = state.t("settings.appearance");
    let modified_tooltip = state.t("settings.modified");
    let reset_tooltip = state.t("settings.resetSetting");

    let light_label = state.t("themes.light");
    let dark_label = state.t("themes.dark");
    let system_label = state.t("themes.system");
    let state_theme = state_entity.clone();
    let theme_control = SegmentedControl::new(
        "segmented-theme",
        vec![
            SegmentedOption::new(ThemeMode::Light, light_label.clone()).icon(Codicon::Sun),
            SegmentedOption::new(ThemeMode::Dark, dark_label.clone()).icon(Codicon::Moon),
            SegmentedOption::new(ThemeMode::System, system_label.clone())
                .icon(Codicon::DeviceDesktop),
        ],
        config.theme,
    )
    .on_change(move |mode, _window, cx| {
        let next_mode = *mode;
        state_theme.update(cx, |this, cx| {
            this.update_configuration(
                AppConfigurationPatch {
                    theme: Some(next_mode),
                    ..Default::default()
                },
                cx,
            );
        });
    });

    let state_reset_theme = state_entity.clone();
    let theme_row = SettingItemBuilder::new(
        "setting-appearance-theme",
        &category_label,
        state.t("settings.theme"),
        theme_control.into_any_element(),
    )
    .description(state.t("settings.themeDescription"))
    .keywords(vec![light_label, dark_label, system_label])
    .modified(
        config.theme != defaults.theme,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        state_reset_theme.update(cx, |this, cx| {
            this.update_configuration(
                AppConfigurationPatch {
                    theme: Some(AppConfiguration::default().theme),
                    ..Default::default()
                },
                cx,
            );
        });
    })
    .build(theme);

    let left_label = state.t("settings.sideBarLocations.left");
    let right_label = state.t("settings.sideBarLocations.right");
    let state_sidebar_pos = state_entity.clone();
    let sidebar_location_control = SegmentedControl::new(
        "segmented-sidebar-location",
        vec![
            SegmentedOption::new(SideBarPosition::Left, left_label.clone())
                .icon(Codicon::LayoutSidebarLeft),
            SegmentedOption::new(SideBarPosition::Right, right_label.clone())
                .icon(Codicon::LayoutSidebarRight),
        ],
        config.side_bar_location,
    )
    .on_change(move |position, _window, cx| {
        let next_pos = *position;
        state_sidebar_pos.update(cx, |this, cx| {
            this.update_configuration(
                AppConfigurationPatch {
                    side_bar_location: Some(next_pos),
                    ..Default::default()
                },
                cx,
            );
        });
    });

    let state_reset_sidebar = state_entity.clone();
    let sidebar_row = SettingItemBuilder::new(
        "setting-appearance-sidebar-location",
        &category_label,
        state.t("settings.sideBarLocation"),
        sidebar_location_control.into_any_element(),
    )
    .description(state.t("settings.sideBarLocationDescription"))
    .keywords(vec![left_label, right_label])
    .modified(
        config.side_bar_location != defaults.side_bar_location,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        state_reset_sidebar.update(cx, |this, cx| {
            this.update_configuration(
                AppConfigurationPatch {
                    side_bar_location: Some(AppConfiguration::default().side_bar_location),
                    ..Default::default()
                },
                cx,
            );
        });
    })
    .build(theme);

    let status_bar_desc = state.t("settings.statusBarVisibleDescription");
    let state_status_bar = state_entity.clone();
    let status_bar_checkbox = Checkbox::new("checkbox-status-bar-visible")
        .checked(config.status_bar_visible)
        .label(status_bar_desc.clone())
        .on_change(move |checked, _window, cx| {
            state_status_bar.update(cx, |this, cx| {
                this.update_configuration(
                    AppConfigurationPatch {
                        status_bar_visible: Some(checked),
                        ..Default::default()
                    },
                    cx,
                );
            });
        });

    let state_reset_status_bar = state_entity.clone();
    let status_bar_row = SettingItemBuilder::new(
        "setting-appearance-status-bar",
        &category_label,
        state.t("settings.statusBarVisible"),
        status_bar_checkbox.into_any_element(),
    )
    .description(status_bar_desc)
    .layout(SettingItemLayout::Checkbox)
    .modified(
        config.status_bar_visible != defaults.status_bar_visible,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        state_reset_status_bar.update(cx, |this, cx| {
            this.update_configuration(
                AppConfigurationPatch {
                    status_bar_visible: Some(AppConfiguration::default().status_bar_visible),
                    ..Default::default()
                },
                cx,
            );
        });
    })
    .build(theme);

    let zoom_out_label = state.t("settings.zoomOut");
    let zoom_in_label = state.t("settings.zoomIn");
    let reset_zoom_label = state.t("settings.resetZoom");
    let state_zoom_out = state_entity.clone();
    let state_zoom_in = state_entity.clone();
    let state_zoom_reset = state_entity.clone();
    let zoom_control = div()
        .flex()
        .items_center()
        .gap(rem_px(4.0))
        .py(rem_px(2.0))
        .px(rem_px(4.0))
        .border_1()
        .border_color(theme.input_border())
        .rounded(rem_px(theme.metrics.corner_radius_medium))
        .bg(theme.input_background())
        .child(
            Button::new("settings-zoom-out")
                .icon_variant()
                .small(true)
                .icon(Codicon::Minus)
                .disabled(config.zoom_level <= MIN_ZOOM_LEVEL)
                .tooltip(zoom_out_label.clone())
                .on_click(move |_event, _window, cx| {
                    state_zoom_out.update(cx, |this, cx| {
                        this.zoom_out(cx);
                    });
                }),
        )
        .child(
            div()
                .min_w(rem_px(76.0))
                .px(rem_px(6.0))
                .text_center()
                .text_size(rem_px(12.0))
                .font_family(MONO_FONT_FAMILY)
                .text_color(theme.foreground())
                .child(format_zoom_display(config.zoom_level)),
        )
        .child(
            Button::new("settings-zoom-in")
                .icon_variant()
                .small(true)
                .icon(Codicon::Plus)
                .disabled(config.zoom_level >= MAX_ZOOM_LEVEL)
                .tooltip(zoom_in_label.clone())
                .on_click(move |_event, _window, cx| {
                    state_zoom_in.update(cx, |this, cx| {
                        this.zoom_in(cx);
                    });
                }),
        )
        .child(
            Button::new("settings-zoom-reset")
                .icon_variant()
                .small(true)
                .icon(Codicon::Discard)
                .disabled((config.zoom_level - DEFAULT_ZOOM_LEVEL).abs() <= f64::EPSILON)
                .tooltip(reset_zoom_label.clone())
                .on_click(move |_event, _window, cx| {
                    state_zoom_reset.update(cx, |this, cx| {
                        this.zoom_reset(cx);
                    });
                }),
        );

    let state_reset_zoom_row = state_entity.clone();
    let zoom_row = SettingItemBuilder::new(
        "setting-appearance-zoom",
        &category_label,
        state.t("settings.pageZoom"),
        zoom_control.into_any_element(),
    )
    .description(state.t("settings.pageZoomDescription"))
    .keywords(vec![zoom_in_label, zoom_out_label, reset_zoom_label])
    .modified(
        (config.zoom_level - defaults.zoom_level).abs() > f64::EPSILON,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        state_reset_zoom_row.update(cx, |this, cx| {
            this.zoom_reset(cx);
        });
    })
    .build(theme);

    let effective_opacity = state.effective_window_opacity();
    let opacity_percent = opacity_to_percent(effective_opacity);
    let state_opacity = state_entity.clone();
    let opacity_slider = Slider::new("slider-window-opacity", 10.0, 100.0, 10.0, opacity_percent)
        .value_label(format!("{opacity_percent:.0}%"))
        .on_change(move |next_percent, _window, cx| {
            let snapped = snap_window_opacity(next_percent / 100.0);
            state_opacity.update(cx, |this, cx| {
                this.set_live_window_opacity(snapped, cx);
                this.update_configuration(
                    AppConfigurationPatch {
                        window_opacity: Some(snapped),
                        ..Default::default()
                    },
                    cx,
                );
            });
        });

    let state_reset_opacity = state_entity.clone();
    let opacity_row = SettingItemBuilder::new(
        "setting-appearance-opacity",
        &category_label,
        state.t("settings.windowOpacity"),
        opacity_slider.into_any_element(),
    )
    .description(state.t("settings.windowOpacityDescription"))
    .modified(
        (config.window_opacity - defaults.window_opacity).abs() > f64::EPSILON,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        state_reset_opacity.update(cx, |this, cx| {
            let default_opacity = AppConfiguration::default().window_opacity;
            this.set_live_window_opacity(default_opacity, cx);
            this.update_configuration(
                AppConfigurationPatch {
                    window_opacity: Some(default_opacity),
                    ..Default::default()
                },
                cx,
            );
        });
    })
    .build(theme);

    let always_on_top_desc = state.t("settings.alwaysOnTopDescription");
    let state_always_on_top = state_entity.clone();
    let always_on_top_checkbox = Checkbox::new("checkbox-always-on-top")
        .checked(config.always_on_top)
        .label(always_on_top_desc.clone())
        .on_change(move |checked, _window, cx| {
            state_always_on_top.update(cx, |this, cx| {
                this.update_configuration(
                    AppConfigurationPatch {
                        always_on_top: Some(checked),
                        ..Default::default()
                    },
                    cx,
                );
            });
        });

    let state_reset_aot = state_entity.clone();
    let always_on_top_row = SettingItemBuilder::new(
        "setting-appearance-always-on-top",
        &category_label,
        state.t("settings.alwaysOnTop"),
        always_on_top_checkbox.into_any_element(),
    )
    .description(always_on_top_desc)
    .layout(SettingItemLayout::Checkbox)
    .modified(
        config.always_on_top != defaults.always_on_top,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        state_reset_aot.update(cx, |this, cx| {
            this.update_configuration(
                AppConfigurationPatch {
                    always_on_top: Some(AppConfiguration::default().always_on_top),
                    ..Default::default()
                },
                cx,
            );
        });
    })
    .build(theme);

    let reset_layout_action = state.t("settings.resetWindowLayoutAction");
    let state_reset_layout = state_entity.clone();
    let reset_layout_button = Button::new("button-reset-window-layout")
        .secondary()
        .icon(Codicon::Discard)
        .label(reset_layout_action.clone())
        .on_click(move |_event, _window, cx| {
            state_reset_layout.update(cx, |this, cx| {
                this.reset_layout(cx);
            });
        });

    let reset_layout_row = SettingItemBuilder::new(
        "setting-appearance-reset-layout",
        &category_label,
        state.t("settings.resetWindowLayout"),
        reset_layout_button.into_any_element(),
    )
    .description(state.t("settings.resetWindowLayoutDescription"))
    .keywords(vec![reset_layout_action])
    .build(theme);

    CategoryContent {
        category: SettingsCategoryId::Appearance,
        title: category_label,
        banner: None,
        groups: vec![
            SettingsGroupSection::standard(
                state.t("settings.interfaceSettings"),
                vec![theme_row, sidebar_row, status_bar_row, zoom_row],
            ),
            SettingsGroupSection::standard(
                state.t("settings.windowSettings"),
                vec![opacity_row, always_on_top_row, reset_layout_row],
            ),
        ],
    }
}
