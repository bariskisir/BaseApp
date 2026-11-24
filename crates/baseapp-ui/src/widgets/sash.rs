use std::cell::Cell;
use std::rc::Rc;

use gpui::{
    App, Bounds, CursorStyle, DispatchPhase, Element, ElementId, GlobalElementId, Hitbox,
    HitboxBehavior, InspectorElementId, IntoElement, LayoutId, MouseButton, MouseDownEvent,
    MouseMoveEvent, MouseUpEvent, Pixels, RenderOnce, Style, Window, fill, point, px, relative,
    size,
};

use crate::theme::{ActiveTheme, rem_px};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SashOrientation {
    Vertical,
    Horizontal,
}

type SashLifecycleHandler = Rc<dyn Fn(&mut Window, &mut App)>;
type SashMoveHandler = Rc<dyn Fn(f32, &mut Window, &mut App)>;

#[derive(IntoElement)]
pub struct Sash {
    id: ElementId,
    orientation: SashOrientation,
    disabled: bool,
    on_drag_start: Option<SashLifecycleHandler>,
    on_drag_move: Option<SashMoveHandler>,
    on_drag_end: Option<SashLifecycleHandler>,
    on_double_click: Option<SashLifecycleHandler>,
}

impl Sash {
    pub fn new(id: impl Into<ElementId>, orientation: SashOrientation) -> Self {
        Self {
            id: id.into(),
            orientation,
            disabled: false,
            on_drag_start: None,
            on_drag_move: None,
            on_drag_end: None,
            on_double_click: None,
        }
    }

    pub fn vertical(id: impl Into<ElementId>) -> Self {
        Self::new(id, SashOrientation::Vertical)
    }

    pub fn horizontal(id: impl Into<ElementId>) -> Self {
        Self::new(id, SashOrientation::Horizontal)
    }

    pub fn disabled(mut self, disabled: bool) -> Self {
        self.disabled = disabled;
        self
    }

    pub fn on_drag_start(mut self, handler: impl Fn(&mut Window, &mut App) + 'static) -> Self {
        self.on_drag_start = Some(Rc::new(handler));
        self
    }

    pub fn on_drag_move(mut self, handler: impl Fn(f32, &mut Window, &mut App) + 'static) -> Self {
        self.on_drag_move = Some(Rc::new(handler));
        self
    }

    pub fn on_drag_end(mut self, handler: impl Fn(&mut Window, &mut App) + 'static) -> Self {
        self.on_drag_end = Some(Rc::new(handler));
        self
    }

    pub fn on_double_click(mut self, handler: impl Fn(&mut Window, &mut App) + 'static) -> Self {
        self.on_double_click = Some(Rc::new(handler));
        self
    }
}

impl RenderOnce for Sash {
    fn render(self, _window: &mut Window, _cx: &mut App) -> impl IntoElement {
        SashElement {
            id: self.id,
            orientation: self.orientation,
            disabled: self.disabled,
            on_drag_start: self.on_drag_start,
            on_drag_move: self.on_drag_move,
            on_drag_end: self.on_drag_end,
            on_double_click: self.on_double_click,
        }
    }
}

#[derive(Clone, Copy, Default)]
struct SashDragData {
    dragging: bool,
    hovered: bool,
    start_axis: f32,
}

#[derive(Default)]
struct SashElementState {
    data: Rc<Cell<SashDragData>>,
}

struct SashElement {
    id: ElementId,
    orientation: SashOrientation,
    disabled: bool,
    on_drag_start: Option<SashLifecycleHandler>,
    on_drag_move: Option<SashMoveHandler>,
    on_drag_end: Option<SashLifecycleHandler>,
    on_double_click: Option<SashLifecycleHandler>,
}

impl Element for SashElement {
    type RequestLayoutState = ();
    type PrepaintState = Hitbox;

    fn id(&self) -> Option<ElementId> {
        Some(self.id.clone())
    }

    fn source_location(&self) -> Option<&'static core::panic::Location<'static>> {
        None
    }

    fn request_layout(
        &mut self,
        _id: Option<&GlobalElementId>,
        _inspector_id: Option<&InspectorElementId>,
        window: &mut Window,
        cx: &mut App,
    ) -> (LayoutId, Self::RequestLayoutState) {
        let theme = ActiveTheme::current(cx);
        let thickness = rem_px(theme.metrics.sash_size);
        let mut style = Style {
            flex_shrink: 0.0,
            ..Default::default()
        };
        match self.orientation {
            SashOrientation::Vertical => {
                style.size.width = thickness.into();
                style.size.height = relative(1.0).into();
            }
            SashOrientation::Horizontal => {
                style.size.width = relative(1.0).into();
                style.size.height = thickness.into();
            }
        }
        (window.request_layout(style, [], cx), ())
    }

    fn prepaint(
        &mut self,
        _id: Option<&GlobalElementId>,
        _inspector_id: Option<&InspectorElementId>,
        bounds: Bounds<Pixels>,
        _request_layout: &mut Self::RequestLayoutState,
        window: &mut Window,
        _cx: &mut App,
    ) -> Self::PrepaintState {
        window.insert_hitbox(bounds, HitboxBehavior::Normal)
    }

    fn paint(
        &mut self,
        global_id: Option<&GlobalElementId>,
        _inspector_id: Option<&InspectorElementId>,
        bounds: Bounds<Pixels>,
        _request_layout: &mut Self::RequestLayoutState,
        hitbox: &mut Self::PrepaintState,
        window: &mut Window,
        cx: &mut App,
    ) {
        let theme = ActiveTheme::current(cx);
        let state_cell = global_id.map(|id| {
            window.with_element_state(id, |state: Option<SashElementState>, _| {
                let state = state.unwrap_or_default();
                let data = state.data.clone();
                (data, state)
            })
        });

        let snapshot = state_cell
            .as_ref()
            .map(|cell| cell.get())
            .unwrap_or_default();
        let active = !self.disabled && (snapshot.dragging || hitbox.is_hovered(window));
        let line_thickness = if active { px(2.0) } else { px(1.0) };
        let line_color = if active {
            theme.sash_hover_border()
        } else {
            theme.border_default()
        };

        let line_bounds = match self.orientation {
            SashOrientation::Vertical => Bounds::new(
                point(
                    bounds.left() + (bounds.size.width - line_thickness) / 2.0,
                    bounds.top(),
                ),
                size(line_thickness, bounds.size.height),
            ),
            SashOrientation::Horizontal => Bounds::new(
                point(
                    bounds.left(),
                    bounds.top() + (bounds.size.height - line_thickness) / 2.0,
                ),
                size(bounds.size.width, line_thickness),
            ),
        };
        window.paint_quad(fill(line_bounds, line_color));

        if self.disabled {
            return;
        }

        let cursor = match self.orientation {
            SashOrientation::Vertical => CursorStyle::ResizeLeftRight,
            SashOrientation::Horizontal => CursorStyle::ResizeUpDown,
        };
        window.set_cursor_style(cursor, hitbox);
        if snapshot.dragging {
            window.set_window_cursor_style(cursor);
        }

        let Some(data) = state_cell else {
            return;
        };

        let orientation = self.orientation;
        let axis_of = move |p: gpui::Point<Pixels>| match orientation {
            SashOrientation::Vertical => f32::from(p.x),
            SashOrientation::Horizontal => f32::from(p.y),
        };

        let data_down = data.clone();
        let hitbox_down = hitbox.clone();
        let on_drag_start = self.on_drag_start.clone();
        let on_double_click = self.on_double_click.clone();
        window.on_mouse_event(move |event: &MouseDownEvent, phase, window, cx| {
            if phase == DispatchPhase::Bubble
                && event.button == MouseButton::Left
                && hitbox_down.is_hovered(window)
            {
                if event.click_count >= 2
                    && let Some(handler) = on_double_click.as_ref()
                {
                    handler(window, cx);
                    cx.stop_propagation();
                    return;
                }
                let mut current = data_down.get();
                current.dragging = true;
                current.start_axis = axis_of(event.position);
                data_down.set(current);
                if let Some(handler) = on_drag_start.as_ref() {
                    handler(window, cx);
                }
                window.refresh();
                cx.stop_propagation();
            }
        });

        let data_move = data.clone();
        let hitbox_move = hitbox.clone();
        let on_drag_move = self.on_drag_move.clone();
        let on_drag_end_move = self.on_drag_end.clone();
        window.on_mouse_event(move |event: &MouseMoveEvent, phase, window, cx| {
            if phase != DispatchPhase::Bubble {
                return;
            }
            let mut current = data_move.get();
            let now_hovered = hitbox_move.is_hovered(window);
            if now_hovered != current.hovered {
                current.hovered = now_hovered;
                data_move.set(current);
                window.refresh();
            }
            if current.dragging {
                if event.pressed_button == Some(MouseButton::Left) {
                    let delta = axis_of(event.position) - current.start_axis;
                    if let Some(handler) = on_drag_move.as_ref() {
                        handler(delta, window, cx);
                    }
                } else {
                    current.dragging = false;
                    data_move.set(current);
                    if let Some(handler) = on_drag_end_move.as_ref() {
                        handler(window, cx);
                    }
                    window.refresh();
                }
            }
        });

        let on_drag_end = self.on_drag_end.clone();
        window.on_mouse_event(move |event: &MouseUpEvent, phase, window, cx| {
            if phase == DispatchPhase::Bubble && event.button == MouseButton::Left {
                let mut current = data.get();
                if current.dragging {
                    current.dragging = false;
                    data.set(current);
                    if let Some(handler) = on_drag_end.as_ref() {
                        handler(window, cx);
                    }
                    window.refresh();
                }
            }
        });
    }
}
