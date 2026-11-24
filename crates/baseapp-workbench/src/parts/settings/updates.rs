use baseapp_platform::{AppConfiguration, AppConfigurationPatch, UpdateState, UpdateStateEvent};
use baseapp_ui::{ActiveTheme, Button, Checkbox, Codicon, MONO_FONT_FAMILY, ProgressBar, rem_px};
use gpui::{App, Entity, FontWeight, div, prelude::*};

use crate::{SettingsCategoryId, WorkbenchState};

use super::common::{CategoryContent, SettingItemBuilder, SettingItemLayout, SettingsGroupSection};

fn resolve_update_status_text(update: &UpdateStateEvent, state: &WorkbenchState) -> String {
    match update.state {
        UpdateState::Checking => state.t("settings.checking"),
        UpdateState::Available => {
            let version = update.version.as_deref().unwrap_or("");
            state.t_args("settings.updateAvailable", &[("version", version)])
        }
        UpdateState::Downloading => {
            let percent = update.percent.unwrap_or(0).to_string();
            state.t_args("settings.downloading", &[("percent", &percent)])
        }
        UpdateState::Downloaded => {
            let version = update.version.as_deref().unwrap_or("");
            state.t_args("settings.readyToInstall", &[("version", version)])
        }
        UpdateState::Error => state.t("settings.updateError"),
        UpdateState::Idle | UpdateState::UpToDate => state.t("settings.upToDate"),
    }
}

pub fn build_updates_category(
    state_entity: &Entity<WorkbenchState>,
    theme: &ActiveTheme,
    cx: &App,
) -> CategoryContent {
    let state = state_entity.read(cx);
    let config = state.config();
    let defaults = AppConfiguration::default();
    let category_label = state.t("settings.updates");
    let modified_tooltip = state.t("settings.modified");
    let reset_tooltip = state.t("settings.resetSetting");

    let auto_update_desc = state.t("settings.checkUpdatesOnStartupDescription");
    let state_auto = state_entity.clone();
    let auto_update_checkbox = Checkbox::new("checkbox-auto-update")
        .checked(config.auto_update)
        .label(auto_update_desc.clone())
        .on_change(move |checked, _window, cx| {
            state_auto.update(cx, |this, cx| {
                this.update_configuration(
                    AppConfigurationPatch {
                        auto_update: Some(checked),
                        ..Default::default()
                    },
                    cx,
                );
            });
        });

    let state_reset_auto = state_entity.clone();
    let auto_update_row = SettingItemBuilder::new(
        "setting-updates-auto",
        &category_label,
        state.t("settings.checkUpdatesOnStartup"),
        auto_update_checkbox.into_any_element(),
    )
    .description(auto_update_desc)
    .layout(SettingItemLayout::Checkbox)
    .modified(
        config.auto_update != defaults.auto_update,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        state_reset_auto.update(cx, |this, cx| {
            this.update_configuration(
                AppConfigurationPatch {
                    auto_update: Some(AppConfiguration::default().auto_update),
                    ..Default::default()
                },
                cx,
            );
        });
    })
    .build(theme);

    let unattended_desc = state.t("settings.unattendedUpdatesDescription");
    let state_unattended = state_entity.clone();
    let unattended_checkbox = Checkbox::new("checkbox-unattended-updates")
        .checked(config.unattended_updates)
        .disabled(!config.auto_update)
        .label(unattended_desc.clone())
        .on_change(move |checked, _window, cx| {
            state_unattended.update(cx, |this, cx| {
                this.update_configuration(
                    AppConfigurationPatch {
                        unattended_updates: Some(checked),
                        ..Default::default()
                    },
                    cx,
                );
            });
        });

    let state_reset_unattended = state_entity.clone();
    let unattended_row = SettingItemBuilder::new(
        "setting-updates-unattended",
        &category_label,
        state.t("settings.unattendedUpdates"),
        unattended_checkbox.into_any_element(),
    )
    .description(unattended_desc)
    .layout(SettingItemLayout::Checkbox)
    .modified(
        config.unattended_updates != defaults.unattended_updates,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        state_reset_unattended.update(cx, |this, cx| {
            if this.config().auto_update {
                this.update_configuration(
                    AppConfigurationPatch {
                        unattended_updates: Some(AppConfiguration::default().unattended_updates),
                        ..Default::default()
                    },
                    cx,
                );
            }
        });
    })
    .build(theme);

    let update = state.update_state();
    let status_title = resolve_update_status_text(update, state);
    let version_desc = state.t_args("settings.version", &[("version", &state.product().version)]);
    let check_updates_label = state.t("settings.checkUpdates");
    let install_now_label = state.t("settings.installNow");
    let open_download_label = state.t("settings.openDownloadPage");
    let release_notes_label = state.t("settings.releaseNotes");

    let action_button = if update.state == UpdateState::Downloaded {
        let state_install = state_entity.clone();
        let page_url = update.page_url.clone();
        Button::new("button-update-install")
            .primary()
            .label(install_now_label.clone())
            .on_click(move |_event, _window, cx| {
                state_install.update(cx, |this, cx| {
                    if let Some(url) = page_url.as_deref() {
                        this.open_external_url(url, cx);
                    } else {
                        this.request_relaunch(cx);
                    }
                });
            })
            .into_any_element()
    } else if update.state == UpdateState::Available
        && let Some(url) = update.page_url.clone()
    {
        let state_open = state_entity.clone();
        Button::new("button-update-open-download")
            .primary()
            .icon(Codicon::LinkExternal)
            .label(open_download_label.clone())
            .on_click(move |_event, _window, cx| {
                state_open.update(cx, |this, cx| {
                    this.open_external_url(&url, cx);
                });
            })
            .into_any_element()
    } else {
        let state_check = state_entity.clone();
        Button::new("button-update-check")
            .secondary()
            .icon(Codicon::Refresh)
            .label(check_updates_label.clone())
            .loading(update.state == UpdateState::Checking)
            .on_click(move |_event, _window, cx| {
                state_check.update(cx, |this, cx| {
                    this.check_for_updates(cx);
                });
            })
            .into_any_element()
    };

    let mut status_builder = SettingItemBuilder::new(
        "setting-updates-status",
        &category_label,
        status_title,
        action_button,
    )
    .description(version_desc)
    .keywords(vec![
        check_updates_label,
        install_now_label,
        open_download_label,
        release_notes_label.clone(),
    ])
    .layout(SettingItemLayout::Inline);

    if update.state == UpdateState::Downloading {
        let percent = f32::from(update.percent.unwrap_or(0));
        status_builder = status_builder.extra(ProgressBar::determinate(percent).into_any_element());
    }
    let status_row = status_builder.build(theme);

    let mut updates_group = SettingsGroupSection::standard(
        state.t("settings.updates"),
        vec![auto_update_row, unattended_row, status_row],
    );

    if let Some(notes) = update
        .release_notes
        .as_deref()
        .map(str::trim)
        .filter(|notes| !notes.is_empty())
    {
        let notes_block = div()
            .flex()
            .flex_col()
            .gap(rem_px(6.0))
            .mt(rem_px(4.0))
            .mx(rem_px(14.0))
            .mb(rem_px(8.0))
            .py(rem_px(12.0))
            .px(rem_px(14.0))
            .rounded(rem_px(theme.metrics.corner_radius_medium))
            .border_1()
            .border_color(theme.border_default())
            .bg(theme.editor_widget_background())
            .child(
                div()
                    .text_size(rem_px(12.0))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(theme.settings_header_foreground())
                    .child(release_notes_label),
            )
            .child(
                div()
                    .id("settings-release-notes-scroll")
                    .max_h(rem_px(220.0))
                    .overflow_y_scroll()
                    .font_family(MONO_FONT_FAMILY)
                    .text_size(rem_px(12.0))
                    .line_height(rem_px(18.0))
                    .text_color(theme.description_foreground())
                    .child(notes.to_string()),
            )
            .into_any_element();
        updates_group = updates_group.with_trailing(notes_block);
    }

    CategoryContent {
        category: SettingsCategoryId::Updates,
        title: category_label,
        banner: None,
        groups: vec![updates_group],
    }
}
