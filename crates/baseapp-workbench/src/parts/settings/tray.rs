use baseapp_platform::{AppConfiguration, AppConfigurationPatch, TrayIconPreset};
use baseapp_ui::{ActiveTheme, Checkbox, Codicon, SelectBox, SelectBoxState, SelectOption};
use gpui::{App, Entity, prelude::*};

use crate::{SettingsCategoryId, WorkbenchState};

use super::common::{
    CategoryContent, SettingItemBuilder, SettingItemLayout, SettingsGroupSection, inline_notice,
};

pub fn tray_icon_select_options(state: &WorkbenchState) -> Vec<SelectOption<TrayIconPreset>> {
    TrayIconPreset::ALL
        .iter()
        .map(|preset| {
            let key = match preset {
                TrayIconPreset::Default => "settings.trayIconDefault",
                TrayIconPreset::Bluetooth => "settings.trayIconBluetooth",
                TrayIconPreset::Weather => "settings.trayIconWeather",
            };
            SelectOption::new(*preset, state.t(key))
        })
        .collect()
}

fn update_show_tray_icon(state_entity: &Entity<WorkbenchState>, next: bool, cx: &mut App) {
    state_entity.update(cx, |this, cx| {
        let patch = if next {
            AppConfigurationPatch {
                show_tray_icon: Some(true),
                ..Default::default()
            }
        } else {
            AppConfigurationPatch {
                show_tray_icon: Some(false),
                minimize_to_tray_on_close: Some(false),
                start_minimized: Some(false),
                ..Default::default()
            }
        };
        this.update_configuration(patch, cx);
    });
}

fn update_minimize_to_tray(state_entity: &Entity<WorkbenchState>, next: bool, cx: &mut App) {
    state_entity.update(cx, |this, cx| {
        let patch = AppConfigurationPatch {
            minimize_to_tray_on_close: Some(next),
            show_tray_icon: if next { Some(true) } else { None },
            ..Default::default()
        };
        this.update_configuration(patch, cx);
    });
}

fn update_start_minimized(state_entity: &Entity<WorkbenchState>, next: bool, cx: &mut App) {
    state_entity.update(cx, |this, cx| {
        let patch = AppConfigurationPatch {
            start_minimized: Some(next),
            show_tray_icon: if next { Some(true) } else { None },
            ..Default::default()
        };
        this.update_configuration(patch, cx);
    });
}

pub fn build_tray_category(
    state_entity: &Entity<WorkbenchState>,
    tray_icon_select: &Entity<SelectBoxState<TrayIconPreset>>,
    theme: &ActiveTheme,
    cx: &App,
) -> CategoryContent {
    let state = state_entity.read(cx);
    let config = state.config();
    let defaults = AppConfiguration::default();
    let category_label = state.t("settings.trayAndTaskbar");
    let modified_tooltip = state.t("settings.modified");
    let reset_tooltip = state.t("settings.resetSetting");
    let tray_unavailable = state.is_tray_unavailable();
    let unavailable_tooltip = if tray_unavailable {
        Some(state.t("settings.trayUnavailable"))
    } else {
        None
    };

    let show_tray_desc = state.t("settings.showTrayIconDescription");
    let state_show_tray = state_entity.clone();
    let mut show_tray_checkbox = Checkbox::new("checkbox-show-tray-icon")
        .checked(config.show_tray_icon)
        .disabled(tray_unavailable)
        .label(show_tray_desc.clone())
        .on_change(move |checked, _window, cx| {
            update_show_tray_icon(&state_show_tray, checked, cx);
        });
    if let Some(tip) = unavailable_tooltip.clone() {
        show_tray_checkbox = show_tray_checkbox.tooltip(tip);
    }

    let state_reset_show_tray = state_entity.clone();
    let show_tray_row = SettingItemBuilder::new(
        "setting-tray-show-icon",
        &category_label,
        state.t("settings.showTrayIcon"),
        show_tray_checkbox.into_any_element(),
    )
    .description(show_tray_desc)
    .layout(SettingItemLayout::Checkbox)
    .modified(
        config.show_tray_icon != defaults.show_tray_icon,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        if !state_reset_show_tray.read(cx).is_tray_unavailable() {
            update_show_tray_icon(
                &state_reset_show_tray,
                AppConfiguration::default().show_tray_icon,
                cx,
            );
        }
    })
    .build(theme);

    let tray_icon_keywords: Vec<String> = tray_icon_select_options(state)
        .into_iter()
        .map(|opt| opt.label.to_string())
        .collect();
    let state_reset_tray_icon = state_entity.clone();
    let tray_icon_row = SettingItemBuilder::new(
        "setting-tray-icon-preset",
        &category_label,
        state.t("settings.trayIcon"),
        SelectBox::new(tray_icon_select.clone()).into_any_element(),
    )
    .description(state.t("settings.trayIconDescription"))
    .keywords(tray_icon_keywords)
    .modified(
        config.tray_icon != defaults.tray_icon,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        state_reset_tray_icon.update(cx, |this, cx| {
            if !this.is_tray_unavailable() && this.config().show_tray_icon {
                this.update_configuration(
                    AppConfigurationPatch {
                        tray_icon: Some(AppConfiguration::default().tray_icon),
                        ..Default::default()
                    },
                    cx,
                );
            }
        });
    })
    .build(theme);

    let minimize_desc = state.t("settings.minimizeToTrayOnCloseDescription");
    let state_minimize = state_entity.clone();
    let mut minimize_checkbox = Checkbox::new("checkbox-minimize-to-tray")
        .checked(config.minimize_to_tray_on_close)
        .disabled(tray_unavailable)
        .label(minimize_desc.clone())
        .on_change(move |checked, _window, cx| {
            update_minimize_to_tray(&state_minimize, checked, cx);
        });
    if let Some(tip) = unavailable_tooltip.clone() {
        minimize_checkbox = minimize_checkbox.tooltip(tip);
    }

    let state_reset_minimize = state_entity.clone();
    let minimize_row = SettingItemBuilder::new(
        "setting-tray-minimize-on-close",
        &category_label,
        state.t("settings.minimizeToTrayOnClose"),
        minimize_checkbox.into_any_element(),
    )
    .description(minimize_desc)
    .layout(SettingItemLayout::Checkbox)
    .modified(
        config.minimize_to_tray_on_close != defaults.minimize_to_tray_on_close,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        if !state_reset_minimize.read(cx).is_tray_unavailable() {
            update_minimize_to_tray(
                &state_reset_minimize,
                AppConfiguration::default().minimize_to_tray_on_close,
                cx,
            );
        }
    })
    .build(theme);

    let start_min_desc = state.t("settings.startMinimizedDescription");
    let state_start_min = state_entity.clone();
    let mut start_min_checkbox = Checkbox::new("checkbox-start-minimized")
        .checked(config.start_minimized)
        .disabled(tray_unavailable)
        .label(start_min_desc.clone())
        .on_change(move |checked, _window, cx| {
            update_start_minimized(&state_start_min, checked, cx);
        });
    if let Some(tip) = unavailable_tooltip.clone() {
        start_min_checkbox = start_min_checkbox.tooltip(tip);
    }

    let state_reset_start_min = state_entity.clone();
    let start_min_row = SettingItemBuilder::new(
        "setting-tray-start-minimized",
        &category_label,
        state.t("settings.startMinimized"),
        start_min_checkbox.into_any_element(),
    )
    .description(start_min_desc)
    .layout(SettingItemLayout::Checkbox)
    .modified(
        config.start_minimized != defaults.start_minimized,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        if !state_reset_start_min.read(cx).is_tray_unavailable() {
            update_start_minimized(
                &state_reset_start_min,
                AppConfiguration::default().start_minimized,
                cx,
            );
        }
    })
    .build(theme);

    let show_taskbar_desc = state.t("settings.showTaskbarDescription");
    let state_show_taskbar = state_entity.clone();
    let mut show_taskbar_checkbox = Checkbox::new("checkbox-show-taskbar")
        .checked(config.show_taskbar)
        .disabled(tray_unavailable)
        .label(show_taskbar_desc.clone())
        .on_change(move |checked, _window, cx| {
            state_show_taskbar.update(cx, |this, cx| {
                this.update_configuration(
                    AppConfigurationPatch {
                        show_taskbar: Some(checked),
                        ..Default::default()
                    },
                    cx,
                );
            });
        });
    if let Some(tip) = unavailable_tooltip {
        show_taskbar_checkbox = show_taskbar_checkbox.tooltip(tip);
    }

    let state_reset_taskbar = state_entity.clone();
    let show_taskbar_row = SettingItemBuilder::new(
        "setting-tray-show-taskbar",
        &category_label,
        state.t("settings.showTaskbar"),
        show_taskbar_checkbox.into_any_element(),
    )
    .description(show_taskbar_desc)
    .layout(SettingItemLayout::Checkbox)
    .modified(
        config.show_taskbar != defaults.show_taskbar,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        state_reset_taskbar.update(cx, |this, cx| {
            if !this.is_tray_unavailable() {
                this.update_configuration(
                    AppConfigurationPatch {
                        show_taskbar: Some(AppConfiguration::default().show_taskbar),
                        ..Default::default()
                    },
                    cx,
                );
            }
        });
    })
    .build(theme);

    let mut taskbar_group =
        SettingsGroupSection::standard(state.t("settings.taskbar"), vec![show_taskbar_row]);
    if state.is_window_hidden_from_shell() {
        taskbar_group = taskbar_group.with_trailing(inline_notice(
            Codicon::Warning,
            state.t("settings.hiddenFromShellWarning"),
            true,
            None,
            theme,
        ));
    }

    CategoryContent {
        category: SettingsCategoryId::Tray,
        title: category_label,
        banner: None,
        groups: vec![
            SettingsGroupSection::standard(
                state.t("settings.systemTray"),
                vec![show_tray_row, tray_icon_row, minimize_row, start_min_row],
            ),
            taskbar_group,
        ],
    }
}
