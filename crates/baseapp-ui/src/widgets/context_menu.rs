use std::rc::Rc;

use gpui::{
    AnyElement, App, BoxShadow, ElementId, MouseButton, Pixels, Point, SharedString, Size, Window,
    div, point, prelude::*, px,
};

use crate::icon::{Codicon, codicon};
use crate::theme::{ActiveTheme, rem_px};

type MenuSelectHandler = Rc<dyn Fn(&mut Window, &mut App)>;

#[derive(Clone)]
pub enum ContextMenuEntry {
    Action {
        id: ElementId,
        label: SharedString,
        icon: Option<Codicon>,
        danger: bool,
        disabled: bool,
        checked: bool,
        on_select: MenuSelectHandler,
    },
    Separator,
}

impl ContextMenuEntry {
    pub fn action(
        id: impl Into<ElementId>,
        label: impl Into<SharedString>,
        on_select: impl Fn(&mut Window, &mut App) + 'static,
    ) -> Self {
        Self::Action {
            id: id.into(),
            label: label.into(),
            icon: None,
            danger: false,
            disabled: false,
            checked: false,
            on_select: Rc::new(on_select),
        }
    }

    pub fn separator() -> Self {
        Self::Separator
    }

    pub fn with_icon(mut self, new_icon: Codicon) -> Self {
        if let Self::Action { icon, .. } = &mut self {
            *icon = Some(new_icon);
        }
        self
    }

    pub fn with_danger(mut self, is_danger: bool) -> Self {
        if let Self::Action { danger, .. } = &mut self {
            *danger = is_danger;
        }
        self
    }

    pub fn with_disabled(mut self, is_disabled: bool) -> Self {
        if let Self::Action { disabled, .. } = &mut self {
            *disabled = is_disabled;
        }
        self
    }

    pub fn with_checked(mut self, is_checked: bool) -> Self {
        if let Self::Action { checked, .. } = &mut self {
            *checked = is_checked;
        }
        self
    }
}

#[derive(Clone)]
pub struct ContextMenuModel {
    pub position: Point<Pixels>,
    pub entries: Vec<ContextMenuEntry>,
}

impl ContextMenuModel {
    pub fn new(position: Point<Pixels>, entries: Vec<ContextMenuEntry>) -> Self {
        Self { position, entries }
    }
}

pub fn clamp_context_menu_position(
    position: Point<Pixels>,
    menu_width: Pixels,
    menu_height: Pixels,
    viewport_size: Size<Pixels>,
) -> Point<Pixels> {
    let margin = px(4.0);
    let max_x = (viewport_size.width - menu_width - margin).max(margin);
    let max_y = (viewport_size.height - menu_height - margin).max(margin);
    let x = position.x.max(margin).min(max_x);
    let y = position.y.max(margin).min(max_y);
    point(x, y)
}

fn estimate_menu_height(entries: &[ContextMenuEntry]) -> Pixels {
    let mut height = 8.0_f32;
    for entry in entries {
        height += match entry {
            ContextMenuEntry::Action { .. } => 26.0,
            ContextMenuEntry::Separator => 9.0,
        };
    }
    px(height)
}

pub fn render_context_menu_overlay(
    menu: &ContextMenuModel,
    viewport_size: Size<Pixels>,
    theme: &ActiveTheme,
    on_dismiss: impl Fn(&mut Window, &mut App) + 'static,
) -> AnyElement {
    let dismiss: MenuSelectHandler = Rc::new(on_dismiss);
    let estimated_width = px(200.0);
    let estimated_height = estimate_menu_height(&menu.entries);
    let clamped = clamp_context_menu_position(
        menu.position,
        estimated_width,
        estimated_height,
        viewport_size,
    );

    let has_leading_icon = menu.entries.iter().any(|entry| {
        matches!(
            entry,
            ContextMenuEntry::Action { icon: Some(_), .. }
                | ContextMenuEntry::Action { checked: true, .. }
        )
    });

    let shadow = BoxShadow {
        color: theme.widget_shadow(),
        offset: point(px(0.0), px(4.0)),
        blur_radius: px(16.0),
        spread_radius: px(0.0),
        inset: false,
    };

    let mut panel = div()
        .absolute()
        .left(clamped.x)
        .top(clamped.y)
        .flex()
        .flex_col()
        .min_w(rem_px(170.0))
        .max_w(rem_px(320.0))
        .py(rem_px(4.0))
        .bg(theme.menu_background())
        .text_color(theme.menu_foreground())
        .border_1()
        .border_color(theme.menu_border())
        .rounded(rem_px(theme.metrics.corner_radius_medium))
        .shadow(vec![shadow])
        .on_mouse_down(MouseButton::Left, |_event, _window, cx| {
            cx.stop_propagation();
        })
        .on_mouse_down(MouseButton::Right, |_event, _window, cx| {
            cx.stop_propagation();
        });

    for entry in &menu.entries {
        match entry {
            ContextMenuEntry::Separator => {
                panel = panel.child(
                    div()
                        .h(px(1.0))
                        .my(rem_px(4.0))
                        .mx(rem_px(10.0))
                        .bg(theme.menu_separator_background()),
                );
            }
            ContextMenuEntry::Action {
                id,
                label,
                icon,
                danger,
                disabled,
                checked,
                on_select,
            } => {
                let text_color = if *danger {
                    theme.error_foreground()
                } else {
                    theme.menu_foreground()
                };
                let hover_bg = if *danger {
                    theme.button_danger_background()
                } else {
                    theme.menu_selection_background()
                };
                let hover_fg = theme.menu_selection_foreground();

                let mut row = div()
                    .id(id.clone())
                    .flex()
                    .items_center()
                    .gap(rem_px(8.0))
                    .min_h(rem_px(24.0))
                    .mx(rem_px(4.0))
                    .px(rem_px(10.0))
                    .py(rem_px(2.0))
                    .text_size(rem_px(13.0))
                    .line_height(rem_px(20.0))
                    .text_color(text_color)
                    .rounded(rem_px(theme.metrics.corner_radius_small));

                if has_leading_icon {
                    let slot_icon = icon.or(if *checked { Some(Codicon::Check) } else { None });
                    let mut icon_slot = div()
                        .flex()
                        .items_center()
                        .justify_center()
                        .size(rem_px(16.0))
                        .flex_shrink_0();
                    if let Some(icon_kind) = slot_icon {
                        icon_slot = icon_slot
                            .child(codicon(icon_kind, 14.0, text_color).size(rem_px(14.0)));
                    }
                    row = row.child(icon_slot);
                }

                row = row.child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .overflow_hidden()
                        .whitespace_nowrap()
                        .child(label.clone()),
                );

                if *disabled {
                    row = row.opacity(0.4);
                } else {
                    let select_cb = on_select.clone();
                    let dismiss_cb = dismiss.clone();
                    row = row
                        .cursor_pointer()
                        .hover(move |style| style.bg(hover_bg).text_color(hover_fg))
                        .on_click(move |_event, window, cx| {
                            select_cb(window, cx);
                            dismiss_cb(window, cx);
                        });
                }

                panel = panel.child(row);
            }
        }
    }

    let dismiss_left = dismiss.clone();
    let dismiss_right = dismiss;

    div()
        .id("context-menu-backdrop")
        .absolute()
        .inset_0()
        .on_mouse_down(MouseButton::Left, move |_event, window, cx| {
            dismiss_left(window, cx);
            cx.stop_propagation();
        })
        .on_mouse_down(MouseButton::Right, move |_event, window, cx| {
            dismiss_right(window, cx);
            cx.stop_propagation();
        })
        .child(panel)
        .into_any_element()
}
