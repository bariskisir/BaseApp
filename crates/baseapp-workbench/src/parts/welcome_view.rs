use baseapp_ui::{ActiveTheme, Codicon, brand_logo, codicon, rem_px};
use gpui::{AnyElement, App, Entity, FontWeight, SharedString, Window, div, prelude::*};

use crate::state::WorkbenchState;

struct FeatureTileSpec {
    icon: Codicon,
    title_key: &'static str,
    description_key: &'static str,
}

const FEATURE_TILES: &[FeatureTileSpec] = &[
    FeatureTileSpec {
        icon: Codicon::Window,
        title_key: "workspace.shellTitle",
        description_key: "workspace.shellDescription",
    },
    FeatureTileSpec {
        icon: Codicon::Files,
        title_key: "workspace.sessionsTitle",
        description_key: "workspace.sessionsDescription",
    },
    FeatureTileSpec {
        icon: Codicon::Shield,
        title_key: "workspace.securityTitle",
        description_key: "workspace.securityDescription",
    },
];

fn welcome_action_link(
    id: &'static str,
    icon: Codicon,
    label: impl Into<SharedString>,
    theme: &ActiveTheme,
    on_click: impl Fn(&mut Window, &mut App) + 'static,
) -> AnyElement {
    let link_fg = theme.text_link_foreground();
    let link_hover_fg = theme.text_link_active_foreground();
    let hover_bg = theme.toolbar_hover_background();

    div()
        .id(id)
        .flex()
        .items_center()
        .gap(rem_px(6.0))
        .px(rem_px(10.0))
        .py(rem_px(6.0))
        .rounded(rem_px(theme.metrics.corner_radius_medium))
        .text_size(rem_px(13.0))
        .line_height(rem_px(18.0))
        .text_color(link_fg)
        .cursor_pointer()
        .hover(move |style| style.bg(hover_bg).text_color(link_hover_fg))
        .on_click(move |_event, window, cx| on_click(window, cx))
        .child(codicon(icon, 16.0, link_fg).size(rem_px(16.0)))
        .child(label.into())
        .into_any_element()
}

pub fn render_welcome_view(
    state: &Entity<WorkbenchState>,
    theme: &ActiveTheme,
    _window: &mut Window,
    cx: &mut App,
) -> AnyElement {
    let snapshot = state.read(cx);
    let compact_mode = snapshot.layout().compact_mode;
    let title = snapshot.t("workspace.title");
    let description = snapshot.t("workspace.description");
    let new_session_label = snapshot.t("sessions.newSession");
    let settings_label = snapshot.t("nav.settings");
    let compact_label = snapshot.t(if compact_mode {
        "workspace.fullView"
    } else {
        "workspace.compactView"
    });
    let compact_icon = if compact_mode {
        Codicon::ScreenNormal
    } else {
        Codicon::ScreenFull
    };

    let tile_data: Vec<(Codicon, String, String)> = FEATURE_TILES
        .iter()
        .map(|spec| {
            (
                spec.icon,
                snapshot.t(spec.title_key),
                snapshot.t(spec.description_key),
            )
        })
        .collect();

    let state_new = state.clone();
    let state_settings = state.clone();
    let state_compact = state.clone();

    let actions_row = div()
        .flex()
        .flex_wrap()
        .items_center()
        .gap(rem_px(8.0))
        .child(welcome_action_link(
            "welcome-new-session",
            Codicon::Add,
            new_session_label,
            theme,
            move |_window, cx| {
                state_new.update(cx, |s, cx| {
                    s.create_session(None, cx);
                });
            },
        ))
        .child(welcome_action_link(
            "welcome-open-settings",
            Codicon::SettingsGear,
            settings_label,
            theme,
            move |_window, cx| {
                state_settings.update(cx, |s, cx| s.open_settings(None, cx));
            },
        ))
        .child(welcome_action_link(
            "welcome-toggle-compact",
            compact_icon,
            compact_label,
            theme,
            move |_window, cx| {
                state_compact.update(cx, |s, cx| s.toggle_compact_mode(cx));
            },
        ));

    let tile_bg = theme.welcome_page_tile_background();
    let tile_hover_bg = theme.welcome_page_tile_hover_background();
    let tile_border = theme.border_default();
    let icon_color = theme.accent_primary();

    let mut tiles_row = div().flex().flex_wrap().gap(rem_px(12.0)).w_full();

    for (index, (icon_kind, tile_title, tile_desc)) in tile_data.into_iter().enumerate() {
        let tile = div()
            .id(("welcome-tile", index))
            .flex_1()
            .min_w(rem_px(200.0))
            .flex()
            .items_start()
            .gap(rem_px(12.0))
            .p(rem_px(16.0))
            .bg(tile_bg)
            .border_1()
            .border_color(tile_border)
            .rounded(rem_px(theme.metrics.corner_radius_large))
            .hover(move |style| style.bg(tile_hover_bg))
            .child(
                div()
                    .mt(rem_px(2.0))
                    .flex_shrink_0()
                    .child(codicon(icon_kind, 20.0, icon_color).size(rem_px(20.0))),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap(rem_px(4.0))
                    .child(
                        div()
                            .text_size(rem_px(13.0))
                            .line_height(rem_px(18.0))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(theme.editor_foreground())
                            .child(tile_title),
                    )
                    .child(
                        div()
                            .text_size(rem_px(12.0))
                            .line_height(rem_px(17.0))
                            .text_color(theme.description_foreground())
                            .child(tile_desc),
                    ),
            );

        tiles_row = tiles_row.child(tile);
    }

    let inner = div()
        .w_full()
        .max_w(rem_px(760.0))
        .mx_auto()
        .px(rem_px(32.0))
        .py(rem_px(40.0))
        .flex()
        .flex_col()
        .gap(rem_px(24.0))
        .child(
            div()
                .flex()
                .items_center()
                .gap(rem_px(16.0))
                .child(brand_logo(48.0).size(rem_px(48.0)))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .flex()
                        .flex_col()
                        .gap(rem_px(6.0))
                        .child(
                            div()
                                .text_size(rem_px(22.0))
                                .line_height(rem_px(28.0))
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(theme.editor_foreground())
                                .child(title),
                        )
                        .child(
                            div()
                                .text_size(rem_px(13.0))
                                .line_height(rem_px(19.0))
                                .text_color(theme.description_foreground())
                                .child(description),
                        ),
                ),
        )
        .child(actions_row)
        .child(tiles_row);

    div()
        .id("welcome-editor-scroll")
        .size_full()
        .overflow_y_scroll()
        .flex()
        .flex_col()
        .justify_center()
        .bg(theme.editor_background())
        .text_color(theme.editor_foreground())
        .child(inner)
        .into_any_element()
}
