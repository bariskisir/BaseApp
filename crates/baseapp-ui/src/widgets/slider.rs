use std::cell::Cell;
use std::rc::Rc;

use baseapp_base::{clamp, snap_to_step};
use gpui::{
    App, BorderStyle, Bounds, CursorStyle, DispatchPhase, Element, ElementId, GlobalElementId,
    Hitbox, HitboxBehavior, InspectorElementId, IntoElement, LayoutId, MouseButton, MouseDownEvent,
    MouseMoveEvent, MouseUpEvent, Pixels, RenderOnce, SharedString, Style, Window, div, point,
    prelude::*, px, quad, relative, size, transparent_black,
};

use crate::theme::{ActiveTheme, rem_px};

type SliderChangeHandler = Rc<dyn Fn(f64, &mut Window, &mut App)>;

pub fn slider_value_for_ratio(ratio: f64, min: f64, max: f64, step: f64) -> f64 {
    let clamped_ratio = clamp(ratio, 0.0, 1.0);
    if clamped_ratio.is_nan() || !min.is_finite() || !max.is_finite() || max <= min {
        return min;
    }
    let raw = min + (max - min) * clamped_ratio;
    if step.is_finite() && step > 0.0 {
        let snapped = snap_to_step(raw, min, max, step);
        if snapped.is_finite() { snapped } else { raw }
    } else {
        clamp(raw, min, max)
    }
}

fn slider_ratio(value: f64, min: f64, max: f64) -> f32 {
    if !value.is_finite() || !min.is_finite() || !max.is_finite() || max <= min {
        return 0.0;
    }
    clamp((value - min) / (max - min), 0.0, 1.0) as f32
}

#[derive(IntoElement)]
pub struct Slider {
    id: ElementId,
    min: f64,
    max: f64,
    step: f64,
    value: f64,
    disabled: bool,
    value_label: Option<SharedString>,
    on_change: Option<SliderChangeHandler>,
}

impl Slider {
    pub fn new(id: impl Into<ElementId>, min: f64, max: f64, step: f64, value: f64) -> Self {
        Self {
            id: id.into(),
            min,
            max,
            step,
            value,
            disabled: false,
            value_label: None,
            on_change: None,
        }
    }

    pub fn disabled(mut self, disabled: bool) -> Self {
        self.disabled = disabled;
        self
    }

    pub fn value_label(mut self, label: impl Into<SharedString>) -> Self {
        self.value_label = Some(label.into());
        self
    }

    pub fn on_change(mut self, handler: impl Fn(f64, &mut Window, &mut App) + 'static) -> Self {
        self.on_change = Some(Rc::new(handler));
        self
    }
}

impl RenderOnce for Slider {
    fn render(self, _window: &mut Window, cx: &mut App) -> impl IntoElement {
        let theme = ActiveTheme::current(cx);
        let mut container = div()
            .id(self.id.clone())
            .flex()
            .items_center()
            .gap(rem_px(10.0))
            .min_w(rem_px(180.0));

        if self.disabled {
            container = container.opacity(0.45);
        }

        container = container.child(div().flex_1().min_w(rem_px(100.0)).h(rem_px(18.0)).child(
            SliderTrackElement {
                id: self.id,
                min: self.min,
                max: self.max,
                step: self.step,
                value: self.value,
                disabled: self.disabled,
                on_change: self.on_change,
            },
        ));

        if let Some(label) = self.value_label {
            container = container.child(
                div()
                    .flex_shrink_0()
                    .min_w(rem_px(42.0))
                    .text_right()
                    .text_size(rem_px(12.0))
                    .text_color(theme.description_foreground())
                    .child(label),
            );
        }

        container
    }
}

#[derive(Default)]
struct SliderDragState {
    dragging: Rc<Cell<bool>>,
}

struct SliderTrackElement {
    id: ElementId,
    min: f64,
    max: f64,
    step: f64,
    value: f64,
    disabled: bool,
    on_change: Option<SliderChangeHandler>,
}

impl Element for SliderTrackElement {
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
        let mut style = Style::default();
        style.size.width = relative(1.0).into();
        style.size.height = relative(1.0).into();
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
        let ratio = slider_ratio(self.value, self.min, self.max);
        let rem = window.rem_size();
        let track_height = px(4.0 * (f32::from(rem) / 16.0));
        let thumb_size = px(12.0 * (f32::from(rem) / 16.0));
        let thumb_radius = thumb_size / 2.0;
        let track_y = bounds.top() + (bounds.size.height - track_height) / 2.0;
        let usable_width = (bounds.size.width - thumb_size).max(px(1.0));
        let thumb_center_x = bounds.left() + thumb_radius + usable_width * ratio;

        let track_bounds = Bounds::new(
            point(bounds.left(), track_y),
            size(bounds.size.width, track_height),
        );
        window.paint_quad(quad(
            track_bounds,
            px(2.0),
            theme.input_border(),
            px(0.0),
            transparent_black(),
            BorderStyle::Solid,
        ));

        let fill_width = (thumb_center_x - bounds.left()).max(px(0.0));
        if fill_width > px(0.0) {
            let fill_bounds = Bounds::new(
                point(bounds.left(), track_y),
                size(fill_width, track_height),
            );
            window.paint_quad(quad(
                fill_bounds,
                px(2.0),
                theme.accent_primary(),
                px(0.0),
                transparent_black(),
                BorderStyle::Solid,
            ));
        }

        let hovered = !self.disabled && hitbox.is_hovered(window);
        let thumb_color = if hovered {
            theme.accent_primary_hover()
        } else {
            theme.accent_primary()
        };
        let thumb_bounds = Bounds::new(
            point(
                thumb_center_x - thumb_radius,
                bounds.top() + (bounds.size.height - thumb_size) / 2.0,
            ),
            size(thumb_size, thumb_size),
        );
        window.paint_quad(quad(
            thumb_bounds,
            thumb_radius,
            thumb_color,
            px(1.0),
            theme.button_foreground(),
            BorderStyle::Solid,
        ));

        if self.disabled {
            return;
        }

        window.set_cursor_style(CursorStyle::PointingHand, hitbox);

        let Some(global_id) = global_id else {
            return;
        };

        let dragging = window.with_element_state(global_id, |state: Option<SliderDragState>, _| {
            let state = state.unwrap_or_default();
            let flag = state.dragging.clone();
            (flag, state)
        });

        let min = self.min;
        let max = self.max;
        let step = self.step;
        let on_change = self.on_change.clone();

        let compute_and_emit = move |x: Pixels, window: &mut Window, cx: &mut App| {
            let track_start = bounds.left() + thumb_radius;
            let width_f32 = f32::from(usable_width);
            let ratio_f64 = if width_f32 > 0.0 {
                f64::from((f32::from(x) - f32::from(track_start)) / width_f32)
            } else {
                0.0
            };
            let next = slider_value_for_ratio(ratio_f64, min, max, step);
            if let Some(handler) = on_change.as_ref() {
                handler(next, window, cx);
            }
        };

        let hitbox_down = hitbox.clone();
        let dragging_down = dragging.clone();
        let emit_down = compute_and_emit.clone();
        window.on_mouse_event(move |event: &MouseDownEvent, phase, window, cx| {
            if phase == DispatchPhase::Bubble
                && event.button == MouseButton::Left
                && hitbox_down.is_hovered(window)
            {
                dragging_down.set(true);
                emit_down(event.position.x, window, cx);
                cx.stop_propagation();
            }
        });

        let dragging_move = dragging.clone();
        let emit_move = compute_and_emit;
        window.on_mouse_event(move |event: &MouseMoveEvent, phase, window, cx| {
            if phase == DispatchPhase::Bubble && dragging_move.get() {
                if event.pressed_button == Some(MouseButton::Left) {
                    emit_move(event.position.x, window, cx);
                } else {
                    dragging_move.set(false);
                }
            }
        });

        window.on_mouse_event(move |event: &MouseUpEvent, phase, _window, _cx| {
            if phase == DispatchPhase::Bubble && event.button == MouseButton::Left && dragging.get()
            {
                dragging.set(false);
            }
        });
    }
}
