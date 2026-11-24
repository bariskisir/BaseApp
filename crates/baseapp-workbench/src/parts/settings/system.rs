use std::rc::Rc;

use baseapp_base::format_bytes;
use baseapp_platform::{AppConfiguration, AppConfigurationPatch, LogLevel};
use baseapp_ui::{
    ActiveTheme, Button, Checkbox, Codicon, ConfirmDialogModel, DialogModel, SelectBox,
    SelectBoxState, SelectOption, rem_px,
};
use gpui::{App, Entity, div, prelude::*};

use crate::{SettingsCategoryId, WorkbenchState};

use super::OpenDialogHandler;
use super::common::{
    CategoryContent, SettingItemBuilder, SettingItemLayout, SettingsGroupSection, inline_notice,
};

pub fn log_level_select_options(state: &WorkbenchState) -> Vec<SelectOption<LogLevel>> {
    LogLevel::ALL
        .iter()
        .map(|level| {
            SelectOption::new(
                *level,
                state.t(&format!("settings.logLevels.{}", level.as_str())),
            )
        })
        .collect()
}

pub fn build_system_category(
    state_entity: &Entity<WorkbenchState>,
    log_level_select: &Entity<SelectBoxState<LogLevel>>,
    on_open_dialog: &OpenDialogHandler,
    theme: &ActiveTheme,
    cx: &App,
) -> CategoryContent {
    let state = state_entity.read(cx);
    let config = state.config();
    let defaults = AppConfiguration::default();
    let category_label = state.t("settings.system");
    let modified_tooltip = state.t("settings.modified");
    let reset_tooltip = state.t("settings.resetSetting");

    let hw_accel_desc = state.t("settings.hardwareAccelerationDescription");
    let state_hw = state_entity.clone();
    let hw_checkbox = Checkbox::new("checkbox-hardware-acceleration")
        .checked(config.hardware_acceleration)
        .label(hw_accel_desc.clone())
        .on_change(move |checked, _window, cx| {
            state_hw.update(cx, |this, cx| {
                this.update_configuration(
                    AppConfigurationPatch {
                        hardware_acceleration: Some(checked),
                        ..Default::default()
                    },
                    cx,
                );
            });
        });

    let state_reset_hw = state_entity.clone();
    let hw_row = SettingItemBuilder::new(
        "setting-system-hw-accel",
        &category_label,
        state.t("settings.hardwareAcceleration"),
        hw_checkbox.into_any_element(),
    )
    .description(hw_accel_desc)
    .layout(SettingItemLayout::Checkbox)
    .modified(
        config.hardware_acceleration != defaults.hardware_acceleration,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        state_reset_hw.update(cx, |this, cx| {
            this.update_configuration(
                AppConfigurationPatch {
                    hardware_acceleration: Some(AppConfiguration::default().hardware_acceleration),
                    ..Default::default()
                },
                cx,
            );
        });
    })
    .build(theme);

    let mut performance_group =
        SettingsGroupSection::standard(state.t("settings.performance"), vec![hw_row]);
    if state.is_hardware_acceleration_restart_required() {
        let state_relaunch = state_entity.clone();
        let restart_button = Button::new("button-restart-now")
            .secondary()
            .small(true)
            .label(state.t("settings.restartNow"))
            .on_click(move |_event, _window, cx| {
                state_relaunch.update(cx, |this, cx| {
                    this.request_relaunch(cx);
                });
            })
            .into_any_element();
        performance_group = performance_group.with_trailing(inline_notice(
            Codicon::Refresh,
            state.t("settings.restartRequired"),
            false,
            Some(restart_button),
            theme,
        ));
    }

    let log_level_keywords: Vec<String> = log_level_select_options(state)
        .into_iter()
        .map(|opt| opt.label.to_string())
        .collect();
    let state_reset_log_level = state_entity.clone();
    let log_level_row = SettingItemBuilder::new(
        "setting-system-log-level",
        &category_label,
        state.t("settings.logLevel"),
        SelectBox::new(log_level_select.clone()).into_any_element(),
    )
    .description(state.t("settings.logLevelDescription"))
    .keywords(log_level_keywords)
    .modified(
        config.log_level != defaults.log_level,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        state_reset_log_level.update(cx, |this, cx| {
            this.update_configuration(
                AppConfigurationPatch {
                    log_level: Some(AppConfiguration::default().log_level),
                    ..Default::default()
                },
                cx,
            );
        });
    })
    .build(theme);

    let logs_summary = state.logs_summary();
    let log_files_description = if logs_summary.file_count > 0 {
        let count_str = logs_summary.file_count.to_string();
        let size_str = format_bytes(logs_summary.total_bytes as f64);
        state.t_args(
            "settings.logFilesSummary",
            &[("count", &count_str), ("size", &size_str)],
        )
    } else {
        state.t("settings.logFilesDescription")
    };

    let open_logs_label = state.t("settings.openLogs");
    let clear_logs_label = state.t("settings.clearLogs");
    let clear_confirm_title = state.t("settings.clearLogsConfirmTitle");
    let clear_confirm_detail = state.t("settings.clearLogsConfirmDescription");
    let cancel_label = state.t("common.cancel");
    let state_open_logs = state_entity.clone();
    let state_clear_logs = state_entity.clone();
    let open_dialog = on_open_dialog.clone();
    let confirm_label = clear_logs_label.clone();

    let log_actions = div()
        .flex()
        .items_center()
        .flex_wrap()
        .gap(rem_px(8.0))
        .child(
            Button::new("button-open-logs")
                .secondary()
                .icon(Codicon::FolderOpened)
                .label(open_logs_label.clone())
                .on_click(move |_event, _window, cx| {
                    state_open_logs.update(cx, |this, cx| {
                        this.open_logs_directory(cx);
                    });
                }),
        )
        .child(
            Button::new("button-clear-logs")
                .danger()
                .icon(Codicon::Trash)
                .label(clear_logs_label.clone())
                .disabled(logs_summary.file_count == 0)
                .on_click(move |_event, window, cx| {
                    let state_confirm = state_clear_logs.clone();
                    open_dialog(
                        DialogModel::Confirm(ConfirmDialogModel {
                            title: clear_confirm_title.clone().into(),
                            detail: Some(clear_confirm_detail.clone().into()),
                            confirm_label: confirm_label.clone().into(),
                            cancel_label: cancel_label.clone().into(),
                            danger: true,
                            on_confirm: Rc::new(move |_window, cx| {
                                state_confirm.update(cx, |this, cx| {
                                    this.clear_logs(cx);
                                });
                            }),
                            on_cancel: Rc::new(|_window, _cx| {}),
                        }),
                        window,
                        cx,
                    );
                }),
        );

    let log_files_row = SettingItemBuilder::new(
        "setting-system-log-files",
        &category_label,
        state.t("settings.logFiles"),
        log_actions.into_any_element(),
    )
    .description(log_files_description)
    .keywords(vec![
        open_logs_label,
        clear_logs_label,
        state.t("settings.logFilesDescription"),
    ])
    .build(theme);

    CategoryContent {
        category: SettingsCategoryId::System,
        title: category_label,
        banner: None,
        groups: vec![
            performance_group,
            SettingsGroupSection::standard(
                state.t("settings.logging"),
                vec![log_level_row, log_files_row],
            ),
        ],
    }
}
