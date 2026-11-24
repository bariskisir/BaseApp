use baseapp_ui::{ActiveTheme, Codicon, baseapp_tooltip, codicon, rem_px};
use gpui::{AnyElement, App, Entity, MouseButton, Window, div, prelude::*, px, transparent_black};

use crate::parts::settings::SettingsEditorView;
use crate::parts::welcome_view::render_welcome_view;
use crate::state::{WorkbenchPage, WorkbenchState};

pub fn render_editor_part(
    state: &Entity<WorkbenchState>,
    settings_view: Option<&Entity<SettingsEditorView>>,
    theme: &ActiveTheme,
    window: &mut Window,
    cx: &mut App,
) -> AnyElement {
    let snapshot = state.read(cx);
    let layout = snapshot.layout();
    let is_settings = layout.page == WorkbenchPage::Settings;
    let settings_tab_open = layout.settings_tab_open;

    let session_title = match snapshot.current_session() {
        Some(session) if !session.is_default_title => session.title.clone(),
        _ => snapshot.t("sessions.newSession"),
    };
    let settings_title = snapshot.t("nav.settings");
    let close_label = snapshot.t("common.close");

    let tab_active_bg = theme.tab_active_background();
    let tab_active_fg = theme.tab_active_foreground();
    let tab_inactive_bg = theme.tab_inactive_background();
    let tab_inactive_fg = theme.tab_inactive_foreground();
    let tab_hover_bg = theme.tab_hover_background();
    let tab_border = theme.tab_border();
    let tab_accent = theme.tab_active_border_top();
    let close_hover_bg = theme.toolbar_hover_background();

    let state_workspace = state.clone();
    let ws_fg = if !is_settings {
        tab_active_fg
    } else {
        tab_inactive_fg
    };
    let mut workspace_tab = div()
        .id("editor-tab-workspace")
        .relative()
        .flex()
        .items_center()
        .gap(rem_px(6.0))
        .h_full()
        .px(rem_px(12.0))
        .max_w(rem_px(220.0))
        .bg(if !is_settings {
            tab_active_bg
        } else {
            tab_inactive_bg
        })
        .text_color(ws_fg)
        .border_r_1()
        .border_color(tab_border)
        .cursor_pointer()
        .on_click(move |_event, _window, cx| {
            state_workspace.update(cx, |s, cx| s.set_page(WorkbenchPage::Home, cx));
        })
        .child(codicon(Codicon::Files, 14.0, ws_fg).size(rem_px(14.0)))
        .child(
            div()
                .min_w_0()
                .overflow_hidden()
                .whitespace_nowrap()
                .text_ellipsis()
                .text_size(rem_px(12.0))
                .line_height(rem_px(18.0))
                .child(session_title),
        );

    if !is_settings {
        workspace_tab = workspace_tab.child(
            div()
                .absolute()
                .top_0()
                .left_0()
                .right_0()
                .h(px(2.0))
                .bg(tab_accent),
        );
    } else {
        workspace_tab = workspace_tab.hover(move |style| style.bg(tab_hover_bg));
    }

    let mut tabs_bar = div()
        .id("editor-tabs-bar")
        .flex()
        .items_center()
        .w_full()
        .h(rem_px(theme.metrics.tab_height))
        .flex_shrink_0()
        .bg(theme.editor_group_header_tabs_background())
        .border_b_1()
        .border_color(theme.editor_group_header_tabs_border())
        .child(workspace_tab);

    if settings_tab_open {
        let state_settings_open = state.clone();
        let state_settings_close = state.clone();
        let state_settings_mid = state.clone();
        let st_fg = if is_settings {
            tab_active_fg
        } else {
            tab_inactive_fg
        };

        let close_btn = div()
            .id("editor-tab-settings-close")
            .flex()
            .items_center()
            .justify_center()
            .size(rem_px(18.0))
            .rounded(rem_px(theme.metrics.corner_radius_small))
            .bg(transparent_black())
            .cursor_pointer()
            .hover(move |style| style.bg(close_hover_bg))
            .tooltip(baseapp_tooltip(close_label))
            .on_mouse_down(MouseButton::Left, |_event, _window, cx| {
                cx.stop_propagation();
            })
            .on_click(move |_event, _window, cx| {
                cx.stop_propagation();
                state_settings_close.update(cx, |s, cx| s.close_settings_tab(cx));
            })
            .child(codicon(Codicon::Close, 13.0, st_fg).size(rem_px(13.0)));

        let mut settings_tab = div()
            .id("editor-tab-settings")
            .relative()
            .flex()
            .items_center()
            .gap(rem_px(6.0))
            .h_full()
            .pl(rem_px(12.0))
            .pr(rem_px(8.0))
            .bg(if is_settings {
                tab_active_bg
            } else {
                tab_inactive_bg
            })
            .text_color(st_fg)
            .border_r_1()
            .border_color(tab_border)
            .cursor_pointer()
            .on_click(move |_event, _window, cx| {
                state_settings_open.update(cx, |s, cx| s.set_page(WorkbenchPage::Settings, cx));
            })
            .on_mouse_down(MouseButton::Middle, move |_event, _window, cx| {
                cx.stop_propagation();
                state_settings_mid.update(cx, |s, cx| s.close_settings_tab(cx));
            })
            .child(codicon(Codicon::SettingsGear, 14.0, st_fg).size(rem_px(14.0)))
            .child(
                div()
                    .whitespace_nowrap()
                    .text_size(rem_px(12.0))
                    .line_height(rem_px(18.0))
                    .child(settings_title),
            )
            .child(close_btn);

        if is_settings {
            settings_tab = settings_tab.child(
                div()
                    .absolute()
                    .top_0()
                    .left_0()
                    .right_0()
                    .h(px(2.0))
                    .bg(tab_accent),
            );
        } else {
            settings_tab = settings_tab.hover(move |style| style.bg(tab_hover_bg));
        }

        tabs_bar = tabs_bar.child(settings_tab);
    }

    let content: AnyElement = if is_settings {
        if let Some(view) = settings_view {
            div()
                .size_full()
                .min_h_0()
                .child(view.clone())
                .into_any_element()
        } else {
            div()
                .size_full()
                .bg(theme.editor_background())
                .into_any_element()
        }
    } else {
        render_welcome_view(state, theme, window, cx)
    };

    div()
        .id("workbench-editor")
        .flex_1()
        .min_h_0()
        .min_w_0()
        .flex()
        .flex_col()
        .bg(theme.editor_background())
        .child(tabs_bar)
        .child(div().flex_1().min_h_0().w_full().child(content))
        .into_any_element()
}
