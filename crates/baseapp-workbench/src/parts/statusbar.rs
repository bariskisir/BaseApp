use baseapp_platform::{
    DEFAULT_ZOOM_LEVEL, MAX_ZOOM_LEVEL, MIN_ZOOM_LEVEL, ThemeMode, UpdateState,
    zoom_level_to_zoom_factor,
};
use baseapp_ui::{
    ActiveTheme, Codicon, ContextMenuEntry, ContextMenuModel, baseapp_tooltip, codicon, rem_px,
};
use gpui::{
    AnyElement, App, ClickEvent, Entity, Pixels, Point, SharedString, Window, div, point,
    prelude::*, px,
};

use crate::parts::overlay::OverlayState;
use crate::state::{SESSIONS_VIEW_ID, SettingsCategoryId, WorkbenchPage, WorkbenchState};

fn theme_icon(theme: ThemeMode) -> Codicon {
    match theme {
        ThemeMode::Light => Codicon::Sun,
        ThemeMode::Dark => Codicon::Moon,
        ThemeMode::System => Codicon::DeviceDesktop,
    }
}

fn format_signed_zoom(level: f64) -> String {
    if level > 0.0 {
        format!("+{level}")
    } else {
        format!("{level}")
    }
}

fn statusbar_item(
    id: &'static str,
    icon: Codicon,
    label: impl Into<SharedString>,
    tooltip: impl Into<SharedString>,
    prominent: bool,
    theme: &ActiveTheme,
    on_click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> AnyElement {
    let fg = if prominent {
        theme.status_bar_item_prominent_foreground()
    } else {
        theme.status_bar_foreground()
    };
    let hover_bg = if prominent {
        theme.status_bar_item_prominent_hover_background()
    } else {
        theme.status_bar_item_hover_background()
    };
    let hover_fg = if prominent {
        theme.status_bar_item_prominent_foreground()
    } else {
        theme.status_bar_item_hover_foreground()
    };

    let mut item = div()
        .id(id)
        .flex()
        .items_center()
        .gap(rem_px(4.0))
        .h_full()
        .px(rem_px(6.0))
        .text_size(rem_px(12.0))
        .line_height(rem_px(16.0))
        .text_color(fg)
        .cursor_pointer()
        .whitespace_nowrap()
        .tooltip(baseapp_tooltip(tooltip))
        .hover(move |style| style.bg(hover_bg).text_color(hover_fg))
        .on_click(move |event, window, cx| on_click(event, window, cx))
        .child(codicon(icon, 13.0, fg).size(rem_px(13.0)))
        .child(label.into());

    if prominent {
        item = item.bg(theme.status_bar_item_prominent_background());
    }

    item.into_any_element()
}

fn build_zoom_menu(
    position: Point<Pixels>,
    state: &Entity<WorkbenchState>,
    cx: &App,
) -> ContextMenuModel {
    let snapshot = state.read(cx);
    let level = snapshot.config().zoom_level;
    let zoom_in_label = snapshot.t("settings.zoomIn");
    let zoom_out_label = snapshot.t("settings.zoomOut");
    let zoom_reset_label = snapshot.t("settings.resetZoom");
    let appearance_label = snapshot.t("settings.appearance");

    let state_in = state.clone();
    let state_out = state.clone();
    let state_reset = state.clone();
    let state_appearance = state.clone();

    let entries = vec![
        ContextMenuEntry::action("statusbar-zoom-in", zoom_in_label, move |_window, cx| {
            state_in.update(cx, |s, cx| {
                s.zoom_in(cx);
            });
        })
        .with_icon(Codicon::ZoomIn)
        .with_disabled(level >= MAX_ZOOM_LEVEL),
        ContextMenuEntry::action("statusbar-zoom-out", zoom_out_label, move |_window, cx| {
            state_out.update(cx, |s, cx| {
                s.zoom_out(cx);
            });
        })
        .with_icon(Codicon::ZoomOut)
        .with_disabled(level <= MIN_ZOOM_LEVEL),
        ContextMenuEntry::action(
            "statusbar-zoom-reset",
            zoom_reset_label,
            move |_window, cx| {
                state_reset.update(cx, |s, cx| {
                    s.zoom_reset(cx);
                });
            },
        )
        .with_icon(Codicon::Discard)
        .with_disabled((level - DEFAULT_ZOOM_LEVEL).abs() <= f64::EPSILON),
        ContextMenuEntry::separator(),
        ContextMenuEntry::action(
            "statusbar-zoom-appearance",
            appearance_label,
            move |_window, cx| {
                state_appearance.update(cx, |s, cx| {
                    s.open_settings(Some(SettingsCategoryId::Appearance), cx);
                });
            },
        )
        .with_icon(Codicon::SettingsGear),
    ];

    ContextMenuModel::new(position, entries)
}

pub fn render_statusbar(
    state: &Entity<WorkbenchState>,
    overlay: &Entity<OverlayState>,
    theme: &ActiveTheme,
    _window: &mut Window,
    cx: &mut App,
) -> Option<AnyElement> {
    let snapshot = state.read(cx);
    if !snapshot.layout().status_bar_visible {
        return None;
    }

    let current_session_label = snapshot.current_session().map(|session| {
        if session.is_default_title {
            snapshot.t("sessions.newSession")
        } else {
            session.title.clone()
        }
    });
    let sessions_tooltip = snapshot.t("nav.sessions");

    let pinned_count = snapshot
        .sessions()
        .iter()
        .filter(|session| session.pinned)
        .count();
    let pinned_label = if pinned_count > 0 {
        let count_text = pinned_count.to_string();
        Some(snapshot.t_args("statusBar.pinnedCount", &[("count", &count_text)]))
    } else {
        None
    };
    let pinned_tooltip = snapshot.t("sessions.pinned");

    let zoom_level = snapshot.config().zoom_level;
    let show_zoom = (zoom_level - DEFAULT_ZOOM_LEVEL).abs() > f64::EPSILON;
    let zoom_percent = (zoom_level_to_zoom_factor(zoom_level) * 100.0).round() as i64;
    let zoom_text = format!("{zoom_percent}%");
    let zoom_level_str = format_signed_zoom(zoom_level);
    let zoom_percent_str = zoom_percent.to_string();
    let zoom_tooltip = snapshot.t_args(
        "statusBar.zoomLevel",
        &[("level", &zoom_level_str), ("percent", &zoom_percent_str)],
    );

    let update_event = snapshot.update_state();
    let update_entry: Option<(Codicon, String)> = match update_event.state {
        UpdateState::Checking => Some((Codicon::Loading, snapshot.t("settings.checking"))),
        UpdateState::Available => {
            let version = update_event.version.as_deref().unwrap_or("");
            Some((
                Codicon::CloudDownload,
                snapshot.t_args("settings.updateAvailable", &[("version", version)]),
            ))
        }
        UpdateState::Downloading => {
            let pct = update_event.percent.unwrap_or(0).to_string();
            Some((
                Codicon::CloudDownload,
                snapshot.t_args("settings.downloading", &[("percent", &pct)]),
            ))
        }
        UpdateState::Downloaded => {
            let version = update_event.version.as_deref().unwrap_or("");
            Some((
                Codicon::Pass,
                snapshot.t_args("settings.readyToInstall", &[("version", version)]),
            ))
        }
        UpdateState::Error => Some((Codicon::Warning, snapshot.t("settings.updateError"))),
        UpdateState::Idle | UpdateState::UpToDate => None,
    };
    let updates_tooltip = snapshot.t("settings.updates");

    let locale = snapshot.locale();
    let language_label = snapshot.t(&format!("locales.{}", locale.as_str()));
    let language_tooltip = snapshot.t("settings.interfaceLanguage");

    let theme_mode = snapshot.config().theme;
    let theme_label = snapshot.t(&format!("themes.{}", theme_mode.as_str()));
    let theme_tooltip = snapshot.t("settings.theme");

    let mut left_group = div().flex().items_center().h_full().min_w_0();

    if let Some(session_title) = current_session_label {
        let state_home = state.clone();
        left_group = left_group.child(statusbar_item(
            "statusbar-session",
            Codicon::Files,
            session_title,
            sessions_tooltip,
            false,
            theme,
            move |_event, _window, cx| {
                state_home.update(cx, |s, cx| s.set_page(WorkbenchPage::Home, cx));
            },
        ));
    }

    if let Some(pinned_text) = pinned_label {
        let state_pinned = state.clone();
        left_group = left_group.child(statusbar_item(
            "statusbar-pinned",
            Codicon::Pinned,
            pinned_text,
            pinned_tooltip,
            false,
            theme,
            move |_event, _window, cx| {
                state_pinned.update(cx, |s, cx| {
                    s.set_page(WorkbenchPage::Home, cx);
                    s.open_view(SESSIONS_VIEW_ID, cx);
                });
            },
        ));
    }

    let mut right_group = div().flex().items_center().h_full().flex_shrink_0();

    if show_zoom {
        let state_zoom = state.clone();
        let overlay_zoom = overlay.clone();
        let zoom_icon = if zoom_level > DEFAULT_ZOOM_LEVEL {
            Codicon::ZoomIn
        } else {
            Codicon::ZoomOut
        };
        right_group = right_group.child(statusbar_item(
            "statusbar-zoom",
            zoom_icon,
            zoom_text,
            zoom_tooltip,
            true,
            theme,
            move |event, _window, cx| {
                let pos = event.position();
                let anchor = point(pos.x, (pos.y - px(140.0)).max(px(8.0)));
                let menu = build_zoom_menu(anchor, &state_zoom, cx);
                overlay_zoom.update(cx, |ov, cx| ov.open_context_menu(menu, cx));
            },
        ));
    }

    if let Some((update_icon, update_label)) = update_entry {
        let state_update = state.clone();
        right_group = right_group.child(statusbar_item(
            "statusbar-update",
            update_icon,
            update_label,
            updates_tooltip,
            false,
            theme,
            move |_event, _window, cx| {
                state_update.update(cx, |s, cx| {
                    s.open_settings(Some(SettingsCategoryId::Updates), cx);
                });
            },
        ));
    }

    let state_lang = state.clone();
    right_group = right_group.child(statusbar_item(
        "statusbar-language",
        Codicon::Globe,
        language_label,
        language_tooltip,
        false,
        theme,
        move |_event, _window, cx| {
            state_lang.update(cx, |s, cx| {
                s.open_settings(Some(SettingsCategoryId::General), cx);
            });
        },
    ));

    let state_theme = state.clone();
    right_group = right_group.child(statusbar_item(
        "statusbar-theme",
        theme_icon(theme_mode),
        theme_label,
        theme_tooltip,
        false,
        theme,
        move |_event, _window, cx| {
            state_theme.update(cx, |s, cx| {
                s.cycle_theme(cx);
            });
        },
    ));

    Some(
        div()
            .id("workbench-statusbar")
            .flex()
            .items_center()
            .justify_between()
            .w_full()
            .h(rem_px(theme.metrics.statusbar_height))
            .flex_shrink_0()
            .px(rem_px(4.0))
            .bg(theme.status_bar_background())
            .text_color(theme.status_bar_foreground())
            .border_t_1()
            .border_color(theme.status_bar_border())
            .child(left_group)
            .child(right_group)
            .into_any_element(),
    )
}
