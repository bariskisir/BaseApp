use baseapp_ui::{ActiveTheme, Button, Codicon, brand_logo, codicon, rem_px};
use gpui::{
    AnyElement, App, BoxShadow, Entity, Hsla, SharedString, Window, div, point, prelude::*, px,
};

use crate::state::{NotificationSeverity, WorkbenchState};

fn severity_color(severity: NotificationSeverity, theme: &ActiveTheme) -> Hsla {
    match severity {
        NotificationSeverity::Info => theme.info_foreground(),
        NotificationSeverity::Success => theme.success_foreground(),
        NotificationSeverity::Warning => theme.warning_foreground(),
        NotificationSeverity::Error => theme.error_foreground(),
    }
}

pub fn render_notifications_overlay(
    state: &Entity<WorkbenchState>,
    theme: &ActiveTheme,
    _window: &mut Window,
    cx: &mut App,
) -> Option<AnyElement> {
    let snapshot = state.read(cx);
    let items = snapshot.notifications().items().to_vec();
    if items.is_empty() {
        return None;
    }
    let dismiss_label: SharedString = snapshot.t("common.dismiss").into();

    let shadow = BoxShadow {
        color: theme.widget_shadow(),
        offset: point(px(0.0), px(4.0)),
        blur_radius: px(14.0),
        spread_radius: px(0.0),
        inset: false,
    };

    let bottom_offset = if snapshot.layout().status_bar_visible {
        theme.metrics.statusbar_height + 12.0
    } else {
        12.0
    };

    let mut stack = div()
        .id("workbench-notifications-overlay")
        .absolute()
        .right(rem_px(12.0))
        .bottom(rem_px(bottom_offset))
        .flex()
        .flex_col()
        .gap(rem_px(8.0))
        .w(rem_px(340.0))
        .max_w(rem_px(400.0));

    for item in items {
        let icon_color = severity_color(item.severity, theme);
        let state_dismiss = state.clone();
        let id = item.id;

        let toast = div()
            .id(("notification-toast", id))
            .flex()
            .items_start()
            .gap(rem_px(10.0))
            .px(rem_px(12.0))
            .py(rem_px(10.0))
            .bg(theme.notifications_background())
            .text_color(theme.notifications_foreground())
            .border_1()
            .border_color(theme.notifications_border())
            .rounded(rem_px(theme.metrics.corner_radius_medium))
            .shadow(vec![shadow.clone()])
            .child(
                div()
                    .mt(rem_px(1.0))
                    .flex_shrink_0()
                    .child(codicon(item.severity.icon(), 16.0, icon_color).size(rem_px(16.0))),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .text_size(rem_px(13.0))
                    .line_height(rem_px(18.0))
                    .child(item.message),
            )
            .child(
                Button::new(("notification-dismiss", id))
                    .icon_variant()
                    .small(true)
                    .icon(Codicon::Close)
                    .tooltip(dismiss_label.clone())
                    .on_click(move |_event, _window, cx| {
                        state_dismiss.update(cx, |s, cx| {
                            s.dismiss_notification(id, cx);
                        });
                    }),
            );

        stack = stack.child(toast);
    }

    Some(stack.into_any_element())
}

pub fn render_startup_overlay(
    state: &Entity<WorkbenchState>,
    theme: &ActiveTheme,
    _window: &mut Window,
    cx: &mut App,
) -> Option<AnyElement> {
    let snapshot = state.read(cx);
    let error_message = snapshot.startup_error()?.to_string();
    let retry_label = snapshot.t("common.retry");

    let state_retry = state.clone();

    Some(
        div()
            .id("workbench-startup-overlay")
            .absolute()
            .inset_0()
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .gap(rem_px(16.0))
            .p(rem_px(24.0))
            .bg(theme.workbench_background())
            .text_color(theme.foreground())
            .child(brand_logo(48.0).size(rem_px(48.0)))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(rem_px(8.0))
                    .text_size(rem_px(13.0))
                    .line_height(rem_px(20.0))
                    .text_color(theme.error_foreground())
                    .child(
                        codicon(Codicon::Error, 16.0, theme.error_foreground()).size(rem_px(16.0)),
                    )
                    .child(error_message),
            )
            .child(
                Button::new("startup-overlay-retry")
                    .primary()
                    .icon(Codicon::Refresh)
                    .label(retry_label)
                    .on_click(move |_event, _window, cx| {
                        state_retry.update(cx, |s, cx| {
                            s.retry_initialize(cx);
                        });
                    }),
            )
            .into_any_element(),
    )
}
