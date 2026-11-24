use baseapp_base::{DateFormat, TimeFormat};
use baseapp_platform::{AppConfiguration, AppConfigurationPatch, AppLocale};
use baseapp_ui::{ActiveTheme, Checkbox, SelectBox, SelectBoxState, SelectOption};
use gpui::{App, Entity, prelude::*};

use crate::{SettingsCategoryId, WorkbenchState};

use super::common::{CategoryContent, SettingItemBuilder, SettingItemLayout, SettingsGroupSection};

pub struct GeneralDropdowns {
    pub language: Entity<SelectBoxState<AppLocale>>,
    pub date_format: Entity<SelectBoxState<DateFormat>>,
    pub time_format: Entity<SelectBoxState<TimeFormat>>,
}

pub fn locale_select_options(state: &WorkbenchState) -> Vec<SelectOption<AppLocale>> {
    AppLocale::ALL
        .iter()
        .map(|locale| SelectOption::new(*locale, state.t(&format!("locales.{}", locale.as_str()))))
        .collect()
}

pub fn date_format_select_options(state: &WorkbenchState) -> Vec<SelectOption<DateFormat>> {
    DateFormat::ALL
        .iter()
        .map(|format| {
            SelectOption::new(
                *format,
                state.t(&format!("settings.dateFormats.{}", format.as_str())),
            )
        })
        .collect()
}

pub fn time_format_select_options(state: &WorkbenchState) -> Vec<SelectOption<TimeFormat>> {
    TimeFormat::ALL
        .iter()
        .map(|format| {
            SelectOption::new(
                *format,
                state.t(&format!("settings.timeFormats.{}", format.as_str())),
            )
        })
        .collect()
}

pub fn build_general_category(
    state_entity: &Entity<WorkbenchState>,
    dropdowns: &GeneralDropdowns,
    theme: &ActiveTheme,
    cx: &App,
) -> CategoryContent {
    let state = state_entity.read(cx);
    let config = state.config();
    let defaults = AppConfiguration::default();
    let category_label = state.t("settings.general");
    let modified_tooltip = state.t("settings.modified");
    let reset_tooltip = state.t("settings.resetSetting");

    let locale_keywords: Vec<String> = locale_select_options(state)
        .into_iter()
        .map(|opt| opt.label.to_string())
        .collect();
    let date_keywords: Vec<String> = date_format_select_options(state)
        .into_iter()
        .map(|opt| opt.label.to_string())
        .collect();
    let time_keywords: Vec<String> = time_format_select_options(state)
        .into_iter()
        .map(|opt| opt.label.to_string())
        .collect();

    let state_reset_lang = state_entity.clone();
    let language_row = SettingItemBuilder::new(
        "setting-general-language",
        &category_label,
        state.t("settings.interfaceLanguage"),
        SelectBox::new(dropdowns.language.clone()).into_any_element(),
    )
    .description(state.t("settings.interfaceLanguageDescription"))
    .keywords(locale_keywords)
    .modified(
        config.ui_language != defaults.ui_language,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        state_reset_lang.update(cx, |this, cx| {
            this.update_configuration(
                AppConfigurationPatch {
                    ui_language: Some(AppConfiguration::default().ui_language),
                    ..Default::default()
                },
                cx,
            );
        });
    })
    .build(theme);

    let state_reset_date = state_entity.clone();
    let date_row = SettingItemBuilder::new(
        "setting-general-date-format",
        &category_label,
        state.t("settings.dateFormat"),
        SelectBox::new(dropdowns.date_format.clone()).into_any_element(),
    )
    .description(state.t("settings.dateFormatDescription"))
    .keywords(date_keywords)
    .modified(
        config.date_format != defaults.date_format,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        state_reset_date.update(cx, |this, cx| {
            this.update_configuration(
                AppConfigurationPatch {
                    date_format: Some(AppConfiguration::default().date_format),
                    ..Default::default()
                },
                cx,
            );
        });
    })
    .build(theme);

    let state_reset_time = state_entity.clone();
    let time_row = SettingItemBuilder::new(
        "setting-general-time-format",
        &category_label,
        state.t("settings.timeFormat"),
        SelectBox::new(dropdowns.time_format.clone()).into_any_element(),
    )
    .description(state.t("settings.timeFormatDescription"))
    .keywords(time_keywords)
    .modified(
        config.time_format != defaults.time_format,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        state_reset_time.update(cx, |this, cx| {
            this.update_configuration(
                AppConfigurationPatch {
                    time_format: Some(AppConfiguration::default().time_format),
                    ..Default::default()
                },
                cx,
            );
        });
    })
    .build(theme);

    let startup_unavailable = state.is_startup_launch_unavailable();
    let startup_desc = state.t("settings.launchAtStartupDescription");
    let state_toggle_startup = state_entity.clone();
    let mut startup_checkbox = Checkbox::new("checkbox-launch-at-startup")
        .checked(config.launch_at_startup)
        .disabled(startup_unavailable)
        .label(startup_desc.clone())
        .on_change(move |checked, _window, cx| {
            state_toggle_startup.update(cx, |this, cx| {
                this.update_configuration(
                    AppConfigurationPatch {
                        launch_at_startup: Some(checked),
                        ..Default::default()
                    },
                    cx,
                );
            });
        });
    if startup_unavailable {
        startup_checkbox = startup_checkbox.tooltip(state.t("settings.startupUnavailable"));
    }

    let state_reset_startup = state_entity.clone();
    let startup_row = SettingItemBuilder::new(
        "setting-general-startup",
        &category_label,
        state.t("settings.launchAtStartup"),
        startup_checkbox.into_any_element(),
    )
    .description(startup_desc)
    .layout(SettingItemLayout::Checkbox)
    .modified(
        config.launch_at_startup != defaults.launch_at_startup,
        &modified_tooltip,
        &reset_tooltip,
    )
    .on_reset(move |_window, cx| {
        state_reset_startup.update(cx, |this, cx| {
            if !this.is_startup_launch_unavailable() {
                this.update_configuration(
                    AppConfigurationPatch {
                        launch_at_startup: Some(AppConfiguration::default().launch_at_startup),
                        ..Default::default()
                    },
                    cx,
                );
            }
        });
    })
    .build(theme);

    CategoryContent {
        category: SettingsCategoryId::General,
        title: category_label,
        banner: None,
        groups: vec![
            SettingsGroupSection::standard(
                state.t("settings.languageAndRegion"),
                vec![language_row, date_row, time_row],
            ),
            SettingsGroupSection::standard(state.t("settings.startup"), vec![startup_row]),
        ],
    }
}
