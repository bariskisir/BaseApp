pub mod about;
pub mod appearance;
pub mod common;
pub mod general;
pub mod privacy;
pub mod system;
pub mod tray;
pub mod updates;

use std::rc::Rc;

use baseapp_base::{DateFormat, TimeFormat};
use baseapp_platform::{AppConfigurationPatch, AppLocale, LogLevel, TrayIconPreset};
use baseapp_ui::{
    ActiveTheme, Codicon, DialogModel, InputBox, InputBoxEvent, InputBoxState, SelectBoxState,
    codicon, rem_px,
};
use gpui::{
    App, Context, Entity, Focusable, FontWeight, Render, Subscription, Window, div, prelude::*,
    transparent_black,
};

use crate::{SettingsCategoryId, WorkbenchState};

use self::about::build_about_category;
use self::appearance::build_appearance_category;
use self::common::{CategoryContent, CategoryMatchCounts, filter_category_content, settings_group};
use self::general::{
    GeneralDropdowns, build_general_category, date_format_select_options, locale_select_options,
    time_format_select_options,
};
use self::privacy::build_privacy_category;
use self::system::{build_system_category, log_level_select_options};
use self::tray::{build_tray_category, tray_icon_select_options};
use self::updates::build_updates_category;

pub type OpenDialogHandler = Rc<dyn Fn(DialogModel, &mut Window, &mut App)>;

pub struct SettingsEditorView {
    state: Entity<WorkbenchState>,
    on_open_dialog: OpenDialogHandler,
    search_input: Entity<InputBoxState>,
    language_select: Entity<SelectBoxState<AppLocale>>,
    date_format_select: Entity<SelectBoxState<DateFormat>>,
    time_format_select: Entity<SelectBoxState<TimeFormat>>,
    tray_icon_select: Entity<SelectBoxState<TrayIconPreset>>,
    log_level_select: Entity<SelectBoxState<LogLevel>>,
    search_query: String,
    last_synced_locale: AppLocale,
    _subscriptions: Vec<Subscription>,
}

impl SettingsEditorView {
    pub fn new(
        state: Entity<WorkbenchState>,
        on_open_dialog: OpenDialogHandler,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let (
            initial_locale,
            search_placeholder,
            config,
            tray_disabled,
            locale_options,
            date_options,
            time_options,
            tray_options,
            log_options,
        ) = {
            let snapshot = state.read(cx);
            let cfg = snapshot.config().clone();
            let tray_off = snapshot.is_tray_unavailable() || !cfg.show_tray_icon;
            (
                snapshot.locale(),
                snapshot.t("settings.searchPlaceholder"),
                cfg,
                tray_off,
                locale_select_options(snapshot),
                date_format_select_options(snapshot),
                time_format_select_options(snapshot),
                tray_icon_select_options(snapshot),
                log_level_select_options(snapshot),
            )
        };

        let search_input = cx.new(|cx| {
            InputBoxState::new(cx)
                .with_prefix_icon(Codicon::Search)
                .with_allow_clear(true)
                .with_placeholder(search_placeholder)
        });

        let state_lang = state.clone();
        let language_select = cx.new(|cx| {
            SelectBoxState::new(locale_options, config.ui_language, cx)
                .with_min_width(180.0)
                .with_on_change(move |next_locale, _window, cx| {
                    let chosen = *next_locale;
                    state_lang.update(cx, |this, cx| {
                        this.update_configuration(
                            AppConfigurationPatch {
                                ui_language: Some(chosen),
                                ..Default::default()
                            },
                            cx,
                        );
                    });
                })
        });

        let state_date = state.clone();
        let date_format_select = cx.new(|cx| {
            SelectBoxState::new(date_options, config.date_format, cx)
                .with_min_width(180.0)
                .with_on_change(move |next_format, _window, cx| {
                    let chosen = *next_format;
                    state_date.update(cx, |this, cx| {
                        this.update_configuration(
                            AppConfigurationPatch {
                                date_format: Some(chosen),
                                ..Default::default()
                            },
                            cx,
                        );
                    });
                })
        });

        let state_time = state.clone();
        let time_format_select = cx.new(|cx| {
            SelectBoxState::new(time_options, config.time_format, cx)
                .with_min_width(180.0)
                .with_on_change(move |next_format, _window, cx| {
                    let chosen = *next_format;
                    state_time.update(cx, |this, cx| {
                        this.update_configuration(
                            AppConfigurationPatch {
                                time_format: Some(chosen),
                                ..Default::default()
                            },
                            cx,
                        );
                    });
                })
        });

        let state_tray = state.clone();
        let tray_icon_select = cx.new(|cx| {
            SelectBoxState::new(tray_options, config.tray_icon, cx)
                .with_min_width(180.0)
                .with_disabled(tray_disabled)
                .with_on_change(move |next_preset, _window, cx| {
                    let chosen = *next_preset;
                    state_tray.update(cx, |this, cx| {
                        this.update_configuration(
                            AppConfigurationPatch {
                                tray_icon: Some(chosen),
                                ..Default::default()
                            },
                            cx,
                        );
                    });
                })
        });

        let state_log = state.clone();
        let log_level_select = cx.new(|cx| {
            SelectBoxState::new(log_options, config.log_level, cx)
                .with_min_width(180.0)
                .with_on_change(move |next_level, _window, cx| {
                    let chosen = *next_level;
                    state_log.update(cx, |this, cx| {
                        this.update_configuration(
                            AppConfigurationPatch {
                                log_level: Some(chosen),
                                ..Default::default()
                            },
                            cx,
                        );
                    });
                })
        });

        let search_subscription = cx.subscribe(&search_input, Self::on_search_event);
        let state_subscription = cx.observe(&state, Self::on_state_changed);

        Self {
            state,
            on_open_dialog,
            search_input,
            language_select,
            date_format_select,
            time_format_select,
            tray_icon_select,
            log_level_select,
            search_query: String::new(),
            last_synced_locale: initial_locale,
            _subscriptions: vec![search_subscription, state_subscription],
        }
    }

    pub fn focus_search(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let focus_handle = self.search_input.read(cx).focus_handle(cx);
        window.focus(&focus_handle, cx);
    }

    fn on_search_event(
        &mut self,
        input: Entity<InputBoxState>,
        event: &InputBoxEvent,
        cx: &mut Context<Self>,
    ) {
        match event {
            InputBoxEvent::Changed(next_query) => {
                self.search_query = next_query.clone();
                cx.notify();
            }
            InputBoxEvent::Escape => {
                if !self.search_query.is_empty() {
                    self.search_query.clear();
                    input.update(cx, |this, cx| this.clear(cx));
                    cx.notify();
                }
            }
            InputBoxEvent::Submit(_) => {}
        }
    }

    fn on_state_changed(&mut self, state: Entity<WorkbenchState>, cx: &mut Context<Self>) {
        let (locale, config, tray_disabled) = {
            let snapshot = state.read(cx);
            let cfg = snapshot.config().clone();
            let tray_off = snapshot.is_tray_unavailable() || !cfg.show_tray_icon;
            (snapshot.locale(), cfg, tray_off)
        };

        if locale != self.last_synced_locale {
            self.last_synced_locale = locale;
            let (placeholder, locale_opts, date_opts, time_opts, tray_opts, log_opts) = {
                let snapshot = state.read(cx);
                (
                    snapshot.t("settings.searchPlaceholder"),
                    locale_select_options(snapshot),
                    date_format_select_options(snapshot),
                    time_format_select_options(snapshot),
                    tray_icon_select_options(snapshot),
                    log_level_select_options(snapshot),
                )
            };
            self.search_input.update(cx, |this, cx| {
                this.set_placeholder(placeholder, cx);
            });
            self.language_select.update(cx, |this, cx| {
                this.set_options(locale_opts, cx);
            });
            self.date_format_select.update(cx, |this, cx| {
                this.set_options(date_opts, cx);
            });
            self.time_format_select.update(cx, |this, cx| {
                this.set_options(time_opts, cx);
            });
            self.tray_icon_select.update(cx, |this, cx| {
                this.set_options(tray_opts, cx);
            });
            self.log_level_select.update(cx, |this, cx| {
                this.set_options(log_opts, cx);
            });
        }

        self.language_select.update(cx, |this, cx| {
            if *this.selected() != config.ui_language {
                this.set_selected(config.ui_language, cx);
            }
        });
        self.date_format_select.update(cx, |this, cx| {
            if *this.selected() != config.date_format {
                this.set_selected(config.date_format, cx);
            }
        });
        self.time_format_select.update(cx, |this, cx| {
            if *this.selected() != config.time_format {
                this.set_selected(config.time_format, cx);
            }
        });
        self.tray_icon_select.update(cx, |this, cx| {
            if *this.selected() != config.tray_icon {
                this.set_selected(config.tray_icon, cx);
            }
            if this.is_disabled() != tray_disabled {
                this.set_disabled(tray_disabled, cx);
            }
        });
        self.log_level_select.update(cx, |this, cx| {
            if *this.selected() != config.log_level {
                this.set_selected(config.log_level, cx);
            }
        });

        cx.notify();
    }

    fn build_all_categories(&self, theme: &ActiveTheme, cx: &App) -> Vec<CategoryContent> {
        let general_dropdowns = GeneralDropdowns {
            language: self.language_select.clone(),
            date_format: self.date_format_select.clone(),
            time_format: self.time_format_select.clone(),
        };

        vec![
            build_general_category(&self.state, &general_dropdowns, theme, cx),
            build_appearance_category(&self.state, theme, cx),
            build_tray_category(&self.state, &self.tray_icon_select, theme, cx),
            build_privacy_category(&self.state, &self.on_open_dialog, theme, cx),
            build_system_category(
                &self.state,
                &self.log_level_select,
                &self.on_open_dialog,
                theme,
                cx,
            ),
            build_updates_category(&self.state, theme, cx),
            build_about_category(&self.state, theme, cx),
        ]
    }
}

impl Render for SettingsEditorView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ActiveTheme::current(cx);
        let query = self.search_query.trim().to_string();
        let is_searching = !query.is_empty();

        let (active_section, no_results_label) = {
            let snapshot = self.state.read(cx);
            (
                snapshot.layout().settings_section,
                snapshot.t("settings.noSearchResults"),
            )
        };

        let all_categories = self.build_all_categories(&theme, cx);
        let mut match_counts = CategoryMatchCounts::default();
        let mut visible_categories = Vec::new();

        for category_content in all_categories {
            let category_id = category_content.category;
            if is_searching {
                let (filtered, count) = filter_category_content(category_content, &query);
                match_counts.set(category_id, count);
                if let Some(matched) = filtered {
                    visible_categories.push(matched);
                }
            } else if category_id == active_section {
                visible_categories.push(category_content);
            }
        }

        let mut header = div()
            .flex()
            .items_center()
            .gap(rem_px(12.0))
            .flex_shrink_0()
            .pt(rem_px(12.0))
            .px(rem_px(24.0))
            .pb(rem_px(10.0))
            .border_b_1()
            .border_color(theme.border_default())
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .max_w(rem_px(960.0))
                    .child(InputBox::new(self.search_input.clone())),
            );

        if is_searching {
            let count_str = match_counts.total.to_string();
            let results_label = self
                .state
                .read(cx)
                .t_args("settings.searchResultsCount", &[("count", &count_str)]);
            header = header.child(
                div()
                    .flex_shrink_0()
                    .py(rem_px(2.0))
                    .px(rem_px(8.0))
                    .rounded(rem_px(10.0))
                    .text_size(rem_px(11.0))
                    .line_height(rem_px(16.0))
                    .whitespace_nowrap()
                    .bg(theme.badge_background())
                    .text_color(theme.badge_foreground())
                    .child(results_label),
            );
        }

        let mut toc = div()
            .id("settings-toc-scroll")
            .flex()
            .flex_col()
            .gap(rem_px(2.0))
            .flex_shrink_0()
            .w(rem_px(theme.metrics.settings_toc_width))
            .py(rem_px(12.0))
            .px(rem_px(8.0))
            .overflow_y_scroll()
            .border_r_1()
            .border_color(theme.border_default());

        let list_hover_bg = theme.list_hover_background();
        let active_bg = theme.list_active_selection_background();
        let active_fg = theme.list_active_selection_foreground();
        let idle_fg = theme.foreground();

        for (index, category) in SettingsCategoryId::ALL.iter().enumerate() {
            let category_id = *category;
            let title = self.state.read(cx).t(category_id.title_key());
            let is_active = category_id == active_section;
            let category_count = match_counts.count_for(category_id);
            let dimmed = is_searching && category_count == 0;
            let fg = if is_active { active_fg } else { idle_fg };
            let bg = if is_active {
                active_bg
            } else {
                transparent_black()
            };

            let state_select = self.state.clone();
            let mut item = div()
                .id(("settings-toc", index))
                .flex()
                .items_center()
                .gap(rem_px(8.0))
                .w_full()
                .min_h(rem_px(26.0))
                .py(rem_px(4.0))
                .px(rem_px(10.0))
                .rounded(rem_px(theme.metrics.corner_radius_medium))
                .bg(bg)
                .text_color(fg)
                .text_size(rem_px(13.0))
                .line_height(rem_px(18.0))
                .cursor_pointer()
                .on_click(move |_event, _window, cx| {
                    state_select.update(cx, |this, cx| {
                        this.set_settings_section(category_id, cx);
                    });
                })
                .child(codicon(category_id.icon(), 15.0, fg).size(rem_px(15.0)))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .overflow_hidden()
                        .whitespace_nowrap()
                        .child(title),
                );

            if is_active {
                item = item.font_weight(FontWeight::SEMIBOLD);
            } else {
                item = item.hover(move |style| style.bg(list_hover_bg));
            }

            if dimmed {
                item = item.opacity(0.45);
            }

            if is_searching && category_count > 0 {
                item = item.child(
                    div()
                        .flex_shrink_0()
                        .min_w(rem_px(18.0))
                        .px(rem_px(5.0))
                        .rounded(rem_px(9.0))
                        .text_size(rem_px(11.0))
                        .line_height(rem_px(16.0))
                        .font_weight(FontWeight::MEDIUM)
                        .text_center()
                        .bg(theme.badge_background())
                        .text_color(theme.badge_foreground())
                        .child(category_count.to_string()),
                );
            }

            toc = toc.child(item);
        }

        let mut content_inner = div()
            .flex()
            .flex_col()
            .gap(rem_px(24.0))
            .w_full()
            .max_w(rem_px(960.0));

        if is_searching && visible_categories.is_empty() {
            content_inner = content_inner.child(
                div()
                    .flex()
                    .flex_col()
                    .items_center()
                    .justify_center()
                    .gap(rem_px(10.0))
                    .py(rem_px(64.0))
                    .px(rem_px(24.0))
                    .text_color(theme.description_foreground())
                    .child(
                        codicon(Codicon::Search, 24.0, theme.description_foreground())
                            .size(rem_px(24.0)),
                    )
                    .child(
                        div()
                            .text_size(rem_px(13.0))
                            .line_height(rem_px(18.0))
                            .child(no_results_label),
                    ),
            );
        } else {
            for category_content in visible_categories {
                let mut section = div().flex().flex_col().gap(rem_px(20.0));
                if let Some(banner) = category_content.banner {
                    section = section.child(banner);
                }
                for group in category_content.groups {
                    section = section.child(settings_group(group, &theme));
                }
                content_inner = content_inner.child(section);
            }
        }

        let content_pane = div()
            .id("settings-scroll")
            .flex_1()
            .min_w_0()
            .min_h_0()
            .overflow_y_scroll()
            .pt(rem_px(12.0))
            .px(rem_px(24.0))
            .pb(rem_px(36.0))
            .child(content_inner);

        div()
            .flex()
            .flex_col()
            .size_full()
            .min_h_0()
            .bg(theme.editor_background())
            .text_color(theme.editor_foreground())
            .child(header)
            .child(
                div()
                    .flex()
                    .flex_1()
                    .min_h_0()
                    .overflow_hidden()
                    .child(toc)
                    .child(content_pane),
            )
    }
}
