use std::rc::Rc;

use baseapp_platform::{AppConfiguration, AppConfigurationPatch};
use baseapp_ui::{ActiveTheme, Button, Checkbox, Codicon, ConfirmDialogModel, DialogModel, rem_px};
use gpui::{App, Entity, div, prelude::*};

use crate::{SettingsCategoryId, WorkbenchState};

use super::OpenDialogHandler;
use super::common::{CategoryContent, SettingItemBuilder, SettingItemLayout, SettingsGroupSection};

pub fn build_privacy_category(
    state_entity: &Entity<WorkbenchState>,
    on_open_dialog: &OpenDialogHandler,
    theme: &ActiveTheme,
    cx: &App,
) -> CategoryContent {
    let state = state_entity.read(cx);
    let config = state.config();
    let defaults = AppConfiguration::default();
    let category_label = state.t("settings.privacyAndData");
    let modified_tooltip = state.t("settings.modified");
    let reset_tooltip = state.t("settings.resetSetting");

    let content_protection_desc = state.t("settings.contentProtectionDescription");
    let state_content_protection = state_entity.clone();
    let content_protection_checkbox = Checkbox::new("checkbox-content-protection")
        .checked(config.content_protection)
        .label(content_protection_desc.clone())
        .on_change(move |checked, _window, cx| {
            state_content_protection.update(cx, |this, cx| {
                this.update_configuration(
                    AppConfigurationPatch {
                        content_protection: Some(checked),
                        ..Default::default()
                    },
                    cx,
                );
            });
        });

    let state_reset_cp = state_entity.clone();
    let content_protection_row = SettingItemBuilder::new(
        "setting-privacy-content-protection",
        &category_label,
        state.t("settings.contentProtection"),
        content_protection_checkbox.into_any_element(),
    )
    .description(content_protection_desc)
    .layout(SettingItemLayout::Checkbox)
    .modified(
        config.content_protection != defaults.content_protection,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        state_reset_cp.update(cx, |this, cx| {
            this.update_configuration(
                AppConfigurationPatch {
                    content_protection: Some(AppConfiguration::default().content_protection),
                    ..Default::default()
                },
                cx,
            );
        });
    })
    .build(theme);

    let telemetry_desc = state.t("settings.telemetryDescription");
    let state_telemetry = state_entity.clone();
    let telemetry_checkbox = Checkbox::new("checkbox-telemetry-enabled")
        .checked(config.telemetry_enabled)
        .label(telemetry_desc.clone())
        .on_change(move |checked, _window, cx| {
            state_telemetry.update(cx, |this, cx| {
                this.update_configuration(
                    AppConfigurationPatch {
                        telemetry_enabled: Some(checked),
                        ..Default::default()
                    },
                    cx,
                );
            });
        });

    let state_reset_telemetry = state_entity.clone();
    let telemetry_row = SettingItemBuilder::new(
        "setting-privacy-telemetry",
        &category_label,
        state.t("settings.telemetryCollection"),
        telemetry_checkbox.into_any_element(),
    )
    .description(telemetry_desc)
    .layout(SettingItemLayout::Checkbox)
    .modified(
        config.telemetry_enabled != defaults.telemetry_enabled,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        state_reset_telemetry.update(cx, |this, cx| {
            this.update_configuration(
                AppConfigurationPatch {
                    telemetry_enabled: Some(AppConfiguration::default().telemetry_enabled),
                    ..Default::default()
                },
                cx,
            );
        });
    })
    .build(theme);

    let export_label = state.t("settings.exportSettings");
    let import_label = state.t("settings.importSettings");
    let state_export = state_entity.clone();
    let state_import = state_entity.clone();
    let backup_actions = div()
        .flex()
        .items_center()
        .flex_wrap()
        .gap(rem_px(8.0))
        .child(
            Button::new("button-export-settings")
                .secondary()
                .icon(Codicon::CloudDownload)
                .label(export_label.clone())
                .on_click(move |_event, _window, cx| {
                    state_export.update(cx, |this, cx| {
                        this.export_configuration(cx);
                    });
                }),
        )
        .child(
            Button::new("button-import-settings")
                .secondary()
                .icon(Codicon::CloudUpload)
                .label(import_label.clone())
                .on_click(move |_event, _window, cx| {
                    state_import.update(cx, |this, cx| {
                        this.import_configuration(cx);
                    });
                }),
        );

    let backup_row = SettingItemBuilder::new(
        "setting-privacy-backup",
        &category_label,
        state.t("settings.backupSettings"),
        backup_actions.into_any_element(),
    )
    .description(state.t("settings.backupSettingsDescription"))
    .keywords(vec![export_label, import_label])
    .build(theme);

    let open_folder_label = state.t("settings.openFolder");
    let state_open_data = state_entity.clone();
    let open_folder_button = Button::new("button-open-data-folder")
        .secondary()
        .icon(Codicon::FolderOpened)
        .label(open_folder_label.clone())
        .on_click(move |_event, _window, cx| {
            state_open_data.update(cx, |this, cx| {
                this.open_data_directory(cx);
            });
        });

    let data_folder_row = SettingItemBuilder::new(
        "setting-privacy-data-folder",
        &category_label,
        state.t("settings.dataFolder"),
        open_folder_button.into_any_element(),
    )
    .description(state.t("settings.dataFolderDescription"))
    .keywords(vec![open_folder_label])
    .build(theme);

    let reset_action_label = state.t("settings.resetSettingsAction");
    let confirm_title = state.t("settings.resetSettingsConfirmTitle");
    let confirm_detail = state.t("settings.resetSettingsConfirmDescription");
    let cancel_label = state.t("common.cancel");
    let state_reset_all = state_entity.clone();
    let open_dialog = on_open_dialog.clone();
    let confirm_label = reset_action_label.clone();
    let reset_settings_button = Button::new("button-reset-settings")
        .danger()
        .icon(Codicon::Discard)
        .label(reset_action_label.clone())
        .on_click(move |_event, window, cx| {
            let state_confirm = state_reset_all.clone();
            open_dialog(
                DialogModel::Confirm(ConfirmDialogModel {
                    title: confirm_title.clone().into(),
                    detail: Some(confirm_detail.clone().into()),
                    confirm_label: confirm_label.clone().into(),
                    cancel_label: cancel_label.clone().into(),
                    danger: true,
                    on_confirm: Rc::new(move |_window, cx| {
                        state_confirm.update(cx, |this, cx| {
                            this.reset_configuration(cx);
                        });
                    }),
                    on_cancel: Rc::new(|_window, _cx| {}),
                }),
                window,
                cx,
            );
        });

    let reset_settings_row = SettingItemBuilder::new(
        "setting-privacy-reset-settings",
        &category_label,
        state.t("settings.resetSettings"),
        reset_settings_button.into_any_element(),
    )
    .description(state.t("settings.resetSettingsDescription"))
    .keywords(vec![reset_action_label])
    .build(theme);

    CategoryContent {
        category: SettingsCategoryId::Privacy,
        title: category_label,
        banner: None,
        groups: vec![
            SettingsGroupSection::standard(
                state.t("settings.privacy"),
                vec![content_protection_row, telemetry_row],
            ),
            SettingsGroupSection::standard(
                state.t("settings.dataAndBackup"),
                vec![backup_row, data_folder_row, reset_settings_row],
            ),
        ],
    }
}
