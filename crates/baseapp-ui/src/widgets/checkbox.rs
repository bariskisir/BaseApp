use std::rc::Rc;

use gpui::{App, ElementId, IntoElement, RenderOnce, SharedString, Window, div, prelude::*};

use crate::icon::{Codicon, codicon};
use crate::theme::{ActiveTheme, rem_px};
use crate::widgets::tooltip::baseapp_tooltip;

type ChangeHandler = Rc<dyn Fn(bool, &mut Window, &mut App)>;

#[derive(IntoElement)]
pub struct Checkbox {
    id: ElementId,
    checked: bool,
    disabled: bool,
    label: Option<SharedString>,
    tooltip: Option<SharedString>,
    on_change: Option<ChangeHandler>,
}

impl Checkbox {
    pub fn new(id: impl Into<ElementId>) -> Self {
        Self {
            id: id.into(),
            checked: false,
            disabled: false,
            label: None,
            tooltip: None,
            on_change: None,
        }
    }

    pub fn checked(mut self, checked: bool) -> Self {
        self.checked = checked;
        self
    }

    pub fn disabled(mut self, disabled: bool) -> Self {
        self.disabled = disabled;
        self
    }

    pub fn label(mut self, label: impl Into<SharedString>) -> Self {
        self.label = Some(label.into());
        self
    }

    pub fn tooltip(mut self, tooltip: impl Into<SharedString>) -> Self {
        self.tooltip = Some(tooltip.into());
        self
    }

    pub fn on_change(mut self, handler: impl Fn(bool, &mut Window, &mut App) + 'static) -> Self {
        self.on_change = Some(Rc::new(handler));
        self
    }
}

impl RenderOnce for Checkbox {
    fn render(self, _window: &mut Window, cx: &mut App) -> impl IntoElement {
        let theme = ActiveTheme::current(cx);
        let focus_border = theme.focus_border();
        let next_value = !self.checked;

        let mut box_el = div()
            .flex()
            .items_center()
            .justify_center()
            .flex_shrink_0()
            .size(rem_px(18.0))
            .rounded(rem_px(3.0))
            .bg(theme.checkbox_background())
            .border_1()
            .border_color(theme.checkbox_border());

        if self.checked {
            box_el = box_el.child(
                codicon(Codicon::Check, 13.0, theme.checkbox_foreground()).size(rem_px(13.0)),
            );
        }

        let mut container = div()
            .id(self.id)
            .flex()
            .items_center()
            .gap(rem_px(8.0))
            .text_size(rem_px(13.0))
            .line_height(rem_px(18.0))
            .text_color(theme.foreground());

        if self.disabled {
            container = container.opacity(0.45);
        } else {
            box_el = box_el.hover(move |style| style.border_color(focus_border));
            container = container.cursor_pointer();
            if let Some(handler) = self.on_change {
                container = container.on_click(move |_event, window, cx| {
                    handler(next_value, window, cx);
                });
            }
        }

        if let Some(tooltip_text) = self.tooltip {
            container = container.tooltip(baseapp_tooltip(tooltip_text));
        }

        container = container.child(box_el);
        if let Some(label_text) = self.label {
            container = container.child(label_text);
        }

        container
    }
}
