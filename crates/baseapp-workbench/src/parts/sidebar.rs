use std::cell::Cell;
use std::rc::Rc;

use baseapp_platform::{
    SIDEBAR_DEFAULT_WIDTH, SideBarPosition, TERTIARY_DEFAULT_HEIGHT, ViewContainerLocation,
    clamp_sidebar_width, clamp_tertiary_bar_height,
};
use baseapp_ui::{
    ActionBar, ActionBarItem, ActiveTheme, Button, Codicon, ContextMenuEntry, ContextMenuModel,
    Sash, codicon, rem_px,
};
use gpui::{
    AnyElement, App, AppContext as _, BoxShadow, Context, Entity, FontWeight, IntoElement,
    MouseButton, Render, SharedString, Window, div, point, prelude::*, px, transparent_black,
};

use crate::parts::overlay::OverlayState;
use crate::parts::sessions_view::SessionsView;
use crate::state::{SESSIONS_VIEW_ID, ViewDescriptor, WorkbenchState};

#[derive(Clone)]
pub struct DraggedView {
    pub view_id: String,
    pub title: String,
}

struct DraggedViewPreview {
    title: SharedString,
    icon: Codicon,
}

impl Render for DraggedViewPreview {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ActiveTheme::current(cx);
        let shadow = BoxShadow {
            color: theme.widget_shadow(),
            offset: point(px(0.0), px(4.0)),
            blur_radius: px(12.0),
            spread_radius: px(0.0),
            inset: false,
        };

        div()
            .flex()
            .items_center()
            .gap(rem_px(6.0))
            .px(rem_px(10.0))
            .py(rem_px(6.0))
            .bg(theme.menu_background())
            .text_color(theme.menu_foreground())
            .border_1()
            .border_color(theme.focus_border())
            .rounded(rem_px(theme.metrics.corner_radius_medium))
            .shadow(vec![shadow])
            .text_size(rem_px(12.0))
            .line_height(rem_px(16.0))
            .child(codicon(self.icon, 14.0, theme.icon_foreground()).size(rem_px(14.0)))
            .child(self.title.clone())
    }
}

fn other_locations(location: ViewContainerLocation) -> [ViewContainerLocation; 2] {
    match location {
        ViewContainerLocation::Sidebar => [
            ViewContainerLocation::AuxiliaryBar,
            ViewContainerLocation::TertiaryBar,
        ],
        ViewContainerLocation::AuxiliaryBar => [
            ViewContainerLocation::Sidebar,
            ViewContainerLocation::TertiaryBar,
        ],
        ViewContainerLocation::TertiaryBar => [
            ViewContainerLocation::Sidebar,
            ViewContainerLocation::AuxiliaryBar,
        ],
    }
}

fn sidebar_label(state: &WorkbenchState, location: ViewContainerLocation) -> String {
    match location {
        ViewContainerLocation::Sidebar => state.t("sidebar.primarySideBar"),
        ViewContainerLocation::AuxiliaryBar => state.t("sidebar.secondarySideBar"),
        ViewContainerLocation::TertiaryBar => state.t("sidebar.tertiarySideBar"),
    }
}

fn move_to_location_label(state: &WorkbenchState, location: ViewContainerLocation) -> String {
    match location {
        ViewContainerLocation::Sidebar => state.t("sidebar.moveToPrimarySideBar"),
        ViewContainerLocation::AuxiliaryBar => state.t("sidebar.moveToSecondarySideBar"),
        ViewContainerLocation::TertiaryBar => state.t("sidebar.moveToTertiarySideBar"),
    }
}

fn hide_sidebar_label(state: &WorkbenchState, location: ViewContainerLocation) -> String {
    match location {
        ViewContainerLocation::Sidebar => state.t("sidebar.hidePrimarySideBar"),
        ViewContainerLocation::AuxiliaryBar => state.t("sidebar.hideSecondarySideBar"),
        ViewContainerLocation::TertiaryBar => state.t("sidebar.hideTertiarySideBar"),
    }
}

fn location_icon(side_bar_position: SideBarPosition, location: ViewContainerLocation) -> Codicon {
    if location == ViewContainerLocation::TertiaryBar {
        return Codicon::PanelBottom;
    }
    let primary_left = side_bar_position == SideBarPosition::Left;
    if location == ViewContainerLocation::Sidebar {
        if primary_left {
            Codicon::LayoutSidebarLeft
        } else {
            Codicon::LayoutSidebarRight
        }
    } else if primary_left {
        Codicon::LayoutSidebarRight
    } else {
        Codicon::LayoutSidebarLeft
    }
}

fn build_move_view_entries(
    state: &Entity<WorkbenchState>,
    source_location: ViewContainerLocation,
    view_id: &str,
    cx: &App,
) -> Vec<ContextMenuEntry> {
    let snapshot = state.read(cx);
    let position = snapshot.layout().side_bar_position;

    other_locations(source_location)
        .into_iter()
        .map(|target| {
            let label = move_to_location_label(snapshot, target);
            let icon = location_icon(position, target);
            let state_move = state.clone();
            let id_owned = view_id.to_string();
            let entry_id: SharedString = format!("move-view-to-{}", target.as_str()).into();
            ContextMenuEntry::action(entry_id, label, move |_window, cx| {
                state_move.update(cx, |s, cx| {
                    s.move_view_to_location(&id_owned, target, cx);
                });
            })
            .with_icon(icon)
        })
        .collect()
}

fn build_header_context_menu(
    location: ViewContainerLocation,
    active_movable_view_id: Option<String>,
    position: gpui::Point<gpui::Pixels>,
    state: &Entity<WorkbenchState>,
    cx: &App,
) -> ContextMenuModel {
    let snapshot = state.read(cx);
    let side_bar_position = snapshot.layout().side_bar_position;
    let is_primary_left = side_bar_position == SideBarPosition::Left;
    let mut entries = Vec::new();

    if let Some(view_id) = active_movable_view_id {
        entries.extend(build_move_view_entries(state, location, &view_id, cx));
        entries.push(ContextMenuEntry::separator());
    }

    let flip_label = snapshot.t(if is_primary_left {
        "sidebar.movePrimarySideBarRight"
    } else {
        "sidebar.movePrimarySideBarLeft"
    });
    let flip_icon = if is_primary_left {
        Codicon::LayoutSidebarRight
    } else {
        Codicon::LayoutSidebarLeft
    };
    let state_flip = state.clone();
    entries.push(
        ContextMenuEntry::action("sidebar-ctx-flip", flip_label, move |_w, cx| {
            state_flip.update(cx, |s, cx| {
                s.toggle_side_bar_position(cx);
            });
        })
        .with_icon(flip_icon),
    );

    let reset_label = snapshot.t("sidebar.resetViewLocations");
    let state_reset = state.clone();
    entries.push(
        ContextMenuEntry::action("sidebar-ctx-reset-views", reset_label, move |_w, cx| {
            state_reset.update(cx, |s, cx| s.reset_view_locations(cx));
        })
        .with_icon(Codicon::Discard),
    );

    entries.push(ContextMenuEntry::separator());

    let hide_label = hide_sidebar_label(snapshot, location);
    let state_hide = state.clone();
    entries.push(
        ContextMenuEntry::action("sidebar-ctx-hide", hide_label, move |_w, cx| {
            state_hide.update(cx, |s, cx| match location {
                ViewContainerLocation::Sidebar => s.set_sidebar_open(false, cx),
                ViewContainerLocation::AuxiliaryBar => s.set_auxiliary_open(false, cx),
                ViewContainerLocation::TertiaryBar => s.set_tertiary_open(false, cx),
            });
        })
        .with_icon(Codicon::Close),
    );

    ContextMenuModel::new(position, entries)
}

fn render_empty_sidebar(
    location: ViewContainerLocation,
    is_visually_on_left: bool,
    state: &Entity<WorkbenchState>,
    theme: &ActiveTheme,
    cx: &App,
) -> AnyElement {
    let snapshot = state.read(cx);
    let is_horizontal = location == ViewContainerLocation::TertiaryBar;
    let empty_icon = if is_horizontal {
        Codicon::PanelBottomOff
    } else if is_visually_on_left {
        Codicon::LayoutSidebarLeftOff
    } else {
        Codicon::LayoutSidebarRightOff
    };
    let icon_size = if is_horizontal { 18.0 } else { 24.0 };
    let hint = snapshot.t("sidebar.emptyHint");
    let move_here = move_to_location_label(snapshot, location);

    let movable_views: Vec<(String, String)> = other_locations(location)
        .into_iter()
        .flat_map(|other| {
            snapshot
                .views()
                .views_by_location(other)
                .into_iter()
                .filter(|view| view.can_move_view)
                .map(|view| (view.id.to_string(), snapshot.t(view.title_key)))
                .collect::<Vec<_>>()
        })
        .collect();

    let mut box_el = div()
        .flex_1()
        .size_full()
        .min_w_0()
        .min_h_0()
        .overflow_hidden()
        .flex()
        .items_center()
        .justify_center()
        .gap(rem_px(10.0))
        .text_color(theme.description_foreground());

    box_el = if is_horizontal {
        box_el
            .flex_row()
            .flex_wrap()
            .py(rem_px(10.0))
            .px(rem_px(16.0))
    } else {
        box_el.flex_col().p(rem_px(16.0))
    };

    box_el = box_el
        .child(div().flex_shrink_0().child(
            codicon(empty_icon, icon_size, theme.description_foreground()).size(rem_px(icon_size)),
        ))
        .child(
            div()
                .min_w_0()
                .text_center()
                .text_size(rem_px(12.0))
                .line_height(rem_px(17.0))
                .child(hint),
        );

    if !movable_views.is_empty() {
        let mut actions = div()
            .min_w_0()
            .max_w_full()
            .flex()
            .flex_wrap()
            .items_center()
            .justify_center()
            .gap(rem_px(6.0));
        if !is_horizontal {
            actions = actions.w_full();
        }

        for (index, (view_id, view_title)) in movable_views.into_iter().enumerate() {
            let state_move = state.clone();
            let label = format!("{view_title} — {move_here}");
            let btn_id: SharedString =
                format!("sidebar-empty-move-{}-{index}", location.as_str()).into();
            actions = actions.child(
                Button::new(btn_id)
                    .secondary()
                    .small(true)
                    .icon(Codicon::ArrowSwap)
                    .label(label.clone())
                    .tooltip(label)
                    .on_click(move |_event, _window, cx| {
                        state_move.update(cx, |s, cx| {
                            s.move_view_to_location(&view_id, location, cx);
                        });
                    }),
            );
        }

        box_el = box_el.child(actions);
    }

    box_el.into_any_element()
}

pub struct SidebarRenderContext<'a> {
    pub location: ViewContainerLocation,
    pub state: &'a Entity<WorkbenchState>,
    pub overlay: &'a Entity<OverlayState>,
    pub sessions_view: &'a Entity<SessionsView>,
    pub drag_start_size: Rc<Cell<f64>>,
    pub theme: &'a ActiveTheme,
}

pub fn render_sidebar(
    props: SidebarRenderContext<'_>,
    window: &mut Window,
    cx: &mut App,
) -> Option<AnyElement> {
    let SidebarRenderContext {
        location,
        state,
        overlay,
        sessions_view,
        drag_start_size,
        theme,
    } = props;
    let snapshot = state.read(cx);
    let layout = snapshot.layout();
    if layout.compact_mode || !layout.is_location_open(location) {
        return None;
    }

    let is_horizontal = location == ViewContainerLocation::TertiaryBar;
    let side_bar_position = layout.side_bar_position;
    let is_visually_on_left = match location {
        ViewContainerLocation::Sidebar => side_bar_position == SideBarPosition::Left,
        ViewContainerLocation::AuxiliaryBar => side_bar_position == SideBarPosition::Right,
        ViewContainerLocation::TertiaryBar => false,
    };

    let rem_scale = f64::from(f32::from(window.rem_size()) / 16.0).max(0.1);
    let viewport = window.viewport_size();
    let viewport_width = f64::from(f32::from(viewport.width)) / rem_scale;
    let viewport_height = f64::from(f32::from(viewport.height)) / rem_scale;
    let other_width = layout.other_sidebar_visible_width(location);

    let clamped_size = match location {
        ViewContainerLocation::Sidebar => {
            clamp_sidebar_width(layout.sidebar_width, viewport_width, other_width)
        }
        ViewContainerLocation::AuxiliaryBar => {
            clamp_sidebar_width(layout.auxiliary_width, viewport_width, other_width)
        }
        ViewContainerLocation::TertiaryBar => {
            clamp_tertiary_bar_height(layout.tertiary_height, viewport_height)
        }
    };

    let views: Vec<ViewDescriptor> = snapshot
        .views()
        .views_by_location(location)
        .into_iter()
        .cloned()
        .collect();
    let active_view_id = snapshot
        .views()
        .active_view_id(location)
        .map(str::to_string);
    let active_descriptor = active_view_id
        .as_deref()
        .and_then(|id| views.iter().find(|view| view.id == id))
        .or_else(|| views.first())
        .cloned();

    let header_title_fallback = sidebar_label(snapshot, location);
    let move_view_label = snapshot.t("sidebar.moveView");
    let hide_label = hide_sidebar_label(snapshot, location);

    let title_slot: AnyElement = match &active_descriptor {
        None => div()
            .flex_1()
            .min_w_0()
            .overflow_hidden()
            .whitespace_nowrap()
            .text_ellipsis()
            .text_size(rem_px(11.0))
            .line_height(rem_px(16.0))
            .font_weight(FontWeight::SEMIBOLD)
            .text_color(theme.side_bar_title_foreground())
            .child(header_title_fallback.to_uppercase())
            .into_any_element(),
        Some(active) if views.len() == 1 => {
            let localized_title = snapshot.t(active.title_key);
            let mut label_el = div()
                .id(SharedString::from(format!(
                    "sidebar-title-{}",
                    location.as_str()
                )))
                .flex_1()
                .min_w_0()
                .overflow_hidden()
                .whitespace_nowrap()
                .text_ellipsis()
                .text_size(rem_px(11.0))
                .line_height(rem_px(16.0))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(theme.side_bar_title_foreground())
                .child(localized_title.to_uppercase());

            if active.can_move_view {
                let drag_payload = DraggedView {
                    view_id: active.id.to_string(),
                    title: localized_title,
                };
                let drag_icon = active.icon;
                label_el = label_el.cursor_grab().on_drag(
                    drag_payload,
                    move |dragged, _pos, _window, cx| {
                        let title: SharedString = dragged.title.clone().into();
                        cx.new(|_| DraggedViewPreview {
                            title,
                            icon: drag_icon,
                        })
                    },
                );
            }

            label_el.into_any_element()
        }
        Some(active) => {
            let mut tabs = div()
                .flex_1()
                .min_w_0()
                .flex()
                .items_center()
                .gap(rem_px(4.0))
                .overflow_hidden();

            for (index, view) in views.iter().enumerate() {
                let is_active = view.id == active.id;
                let localized_title = snapshot.t(view.title_key);
                let tab_fg = if is_active {
                    theme.foreground()
                } else {
                    theme.description_foreground()
                };
                let tab_bg = if is_active {
                    theme.toolbar_active_background()
                } else {
                    transparent_black()
                };
                let hover_bg = theme.toolbar_hover_background();
                let state_tab = state.clone();
                let view_id = view.id;

                let mut tab = div()
                    .id(SharedString::from(format!(
                        "sidebar-tab-{}-{index}",
                        location.as_str()
                    )))
                    .flex()
                    .items_center()
                    .gap(rem_px(4.0))
                    .px(rem_px(6.0))
                    .py(rem_px(3.0))
                    .rounded(rem_px(theme.metrics.corner_radius_small))
                    .bg(tab_bg)
                    .text_color(tab_fg)
                    .text_size(rem_px(11.0))
                    .line_height(rem_px(16.0))
                    .cursor_pointer()
                    .hover(move |style| style.bg(hover_bg))
                    .on_click(move |_event, _window, cx| {
                        state_tab.update(cx, |s, cx| s.set_active_view_id(location, view_id, cx));
                    })
                    .child(codicon(view.icon, 13.0, tab_fg).size(rem_px(13.0)))
                    .child(localized_title.clone());

                if view.can_move_view {
                    let drag_payload = DraggedView {
                        view_id: view.id.to_string(),
                        title: localized_title,
                    };
                    let drag_icon = view.icon;
                    tab = tab.on_drag(drag_payload, move |dragged, _pos, _window, cx| {
                        let title: SharedString = dragged.title.clone().into();
                        cx.new(|_| DraggedViewPreview {
                            title,
                            icon: drag_icon,
                        })
                    });
                }

                tabs = tabs.child(tab);
            }

            tabs.into_any_element()
        }
    };

    let mut header_items: Vec<ActionBarItem> = Vec::new();
    if let Some(active) = &active_descriptor
        && active.id == SESSIONS_VIEW_ID
    {
        header_items.extend(sessions_view.read(cx).header_actions(cx));
    }

    if let Some(active) = &active_descriptor
        && active.can_move_view
    {
        let state_move = state.clone();
        let overlay_move = overlay.clone();
        let view_id = active.id.to_string();
        let btn_id: SharedString = format!("sidebar-move-view-{}", location.as_str()).into();
        header_items.push(ActionBarItem::new(
            btn_id,
            Codicon::ArrowSwap,
            move_view_label,
            move |event, _window, cx| {
                let entries = build_move_view_entries(&state_move, location, &view_id, cx);
                let pos = event.position();
                let anchor = point(pos.x, pos.y + px(8.0));
                let menu = ContextMenuModel::new(anchor, entries);
                overlay_move.update(cx, |ov, cx| ov.open_context_menu(menu, cx));
            },
        ));
    }

    if location != ViewContainerLocation::Sidebar {
        let state_close = state.clone();
        let btn_id: SharedString = format!("sidebar-close-{}", location.as_str()).into();
        header_items.push(ActionBarItem::new(
            btn_id,
            Codicon::Close,
            hide_label,
            move |_event, _window, cx| {
                state_close.update(cx, |s, cx| match location {
                    ViewContainerLocation::Sidebar => s.set_sidebar_open(false, cx),
                    ViewContainerLocation::AuxiliaryBar => s.set_auxiliary_open(false, cx),
                    ViewContainerLocation::TertiaryBar => s.set_tertiary_open(false, cx),
                });
            },
        ));
    }

    let active_movable_id = active_descriptor
        .as_ref()
        .filter(|view| view.can_move_view)
        .map(|view| view.id.to_string());
    let state_ctx = state.clone();
    let overlay_ctx = overlay.clone();

    let header = div()
        .id(SharedString::from(format!(
            "sidebar-header-{}",
            location.as_str()
        )))
        .flex()
        .items_center()
        .justify_between()
        .gap(rem_px(6.0))
        .w_full()
        .h(rem_px(theme.metrics.sidebar_header_height))
        .px(rem_px(10.0))
        .flex_shrink_0()
        .border_b_1()
        .border_color(theme.side_bar_border())
        .on_mouse_down(MouseButton::Right, move |event, _window, cx| {
            cx.stop_propagation();
            let menu = build_header_context_menu(
                location,
                active_movable_id.clone(),
                event.position,
                &state_ctx,
                cx,
            );
            overlay_ctx.update(cx, |ov, cx| ov.open_context_menu(menu, cx));
        })
        .child(title_slot)
        .child(ActionBar::new(header_items));

    let body: AnyElement = match &active_descriptor {
        Some(active) if active.id == SESSIONS_VIEW_ID => div()
            .flex_1()
            .min_h_0()
            .w_full()
            .child(sessions_view.clone())
            .into_any_element(),
        Some(active) => {
            let localized = snapshot.t(active.title_key);
            div()
                .flex_1()
                .min_h_0()
                .w_full()
                .flex()
                .items_center()
                .justify_center()
                .gap(rem_px(8.0))
                .p(rem_px(16.0))
                .text_color(theme.description_foreground())
                .child(
                    codicon(active.icon, 16.0, theme.description_foreground()).size(rem_px(16.0)),
                )
                .child(localized)
                .into_any_element()
        }
        None => render_empty_sidebar(location, is_visually_on_left, state, theme, cx),
    };

    let drop_bg = theme.side_bar_drop_background();
    let state_drop = state.clone();
    let mut content = div()
        .id(SharedString::from(format!(
            "sidebar-content-{}",
            location.as_str()
        )))
        .flex_1()
        .min_h_0()
        .min_w_0()
        .overflow_hidden()
        .flex()
        .flex_col()
        .bg(theme.side_bar_background())
        .text_color(theme.side_bar_foreground())
        .drag_over::<DraggedView>(move |style, _dragged, _window, _cx| style.bg(drop_bg))
        .on_drop::<DraggedView>(move |dragged, _window, cx| {
            state_drop.update(cx, |s, cx| {
                s.move_view_to_location(&dragged.view_id, location, cx);
            });
        })
        .child(header)
        .child(body);

    if is_horizontal {
        content = content.w_full();
    } else {
        content = content.h_full();
    }

    let start_cell_down = drag_start_size.clone();
    let start_cell_move = drag_start_size;
    let state_start = state.clone();
    let state_move = state.clone();
    let state_end = state.clone();
    let state_dbl = state.clone();
    let resize_direction: f64 = if is_horizontal {
        -1.0
    } else if is_visually_on_left {
        1.0
    } else {
        -1.0
    };

    let sash_id: SharedString = format!("sidebar-sash-{}", location.as_str()).into();
    let sash = if is_horizontal {
        Sash::horizontal(sash_id)
    } else {
        Sash::vertical(sash_id)
    }
    .on_drag_start(move |_window, cx| {
        let layout = state_start.read(cx).layout();
        let current = match location {
            ViewContainerLocation::Sidebar => layout.sidebar_width,
            ViewContainerLocation::AuxiliaryBar => layout.auxiliary_width,
            ViewContainerLocation::TertiaryBar => layout.tertiary_height,
        };
        start_cell_down.set(current);
    })
    .on_drag_move(move |delta_px, window, cx| {
        let scale = f64::from(f32::from(window.rem_size()) / 16.0).max(0.1);
        let delta = f64::from(delta_px) / scale;
        let vp = window.viewport_size();
        let vp_w = f64::from(f32::from(vp.width)) / scale;
        let vp_h = f64::from(f32::from(vp.height)) / scale;
        let raw_next = start_cell_move.get() + delta * resize_direction;
        state_move.update(cx, |s, cx| match location {
            ViewContainerLocation::Sidebar => {
                let other = s.layout().other_sidebar_visible_width(location);
                let next = clamp_sidebar_width(raw_next, vp_w, other);
                s.set_sidebar_width(next, false, cx);
            }
            ViewContainerLocation::AuxiliaryBar => {
                let other = s.layout().other_sidebar_visible_width(location);
                let next = clamp_sidebar_width(raw_next, vp_w, other);
                s.set_auxiliary_width(next, false, cx);
            }
            ViewContainerLocation::TertiaryBar => {
                let next = clamp_tertiary_bar_height(raw_next, vp_h);
                s.set_tertiary_height(next, false, cx);
            }
        });
    })
    .on_drag_end(move |_window, cx| {
        state_end.update(cx, |s, cx| match location {
            ViewContainerLocation::Sidebar => {
                let current = s.layout().sidebar_width;
                s.set_sidebar_width(current, true, cx);
            }
            ViewContainerLocation::AuxiliaryBar => {
                let current = s.layout().auxiliary_width;
                s.set_auxiliary_width(current, true, cx);
            }
            ViewContainerLocation::TertiaryBar => {
                let current = s.layout().tertiary_height;
                s.set_tertiary_height(current, true, cx);
            }
        });
    })
    .on_double_click(move |_window, cx| {
        state_dbl.update(cx, |s, cx| match location {
            ViewContainerLocation::Sidebar => s.set_sidebar_width(SIDEBAR_DEFAULT_WIDTH, true, cx),
            ViewContainerLocation::AuxiliaryBar => {
                s.set_auxiliary_width(SIDEBAR_DEFAULT_WIDTH, true, cx)
            }
            ViewContainerLocation::TertiaryBar => {
                s.set_tertiary_height(TERTIARY_DEFAULT_HEIGHT, true, cx)
            }
        });
    });

    if is_horizontal {
        Some(
            div()
                .id("workbench-tertiary-bar")
                .flex()
                .flex_col()
                .w_full()
                .h(rem_px(clamped_size as f32))
                .flex_shrink_0()
                .child(sash)
                .child(content)
                .into_any_element(),
        )
    } else {
        let mut wrapper = div()
            .id(SharedString::from(format!(
                "workbench-{}",
                location.as_str()
            )))
            .flex()
            .h_full()
            .w(rem_px(clamped_size as f32))
            .flex_shrink_0();

        if is_visually_on_left {
            wrapper = wrapper.child(content).child(sash);
        } else {
            wrapper = wrapper.child(sash).child(content);
        }

        Some(wrapper.into_any_element())
    }
}
