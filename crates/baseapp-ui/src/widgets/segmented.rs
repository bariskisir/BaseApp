use std::rc::Rc;

use gpui::{
    App, ElementId, IntoElement, RenderOnce, SharedString, Window, div, prelude::*,
    transparent_black,
};

use crate::icon::{Codicon, codicon};
use crate::theme::{ActiveTheme, rem_px};
use crate::widgets::tooltip::baseapp_tooltip;

#[derive(Clone, Debug)]
pub struct SegmentedOption<T> {
    pub value: T,
    pub label: SharedString,
    pub icon: Option<Codicon>,
    pub tooltip: Option<SharedString>,
}

impl<T> SegmentedOption<T> {
    pub fn new(value: T, label: impl Into<SharedString>) -> Self {
        Self {
            value,
            label: label.into(),
            icon: None,
            tooltip: None,
        }
    }

    pub fn icon(mut self, icon: Codicon) -> Self {
        self.icon = Some(icon);
        self
    }

    pub fn tooltip(mut self, tooltip: impl Into<SharedString>) -> Self {
        self.tooltip = Some(tooltip.into());
        self
    }
}

type SegmentedChangeHandler<T> = Rc<dyn Fn(&T, &mut Window, &mut App)>;

#[derive(IntoElement)]
pub struct SegmentedControl<T: Clone + PartialEq + 'static> {
    id: ElementId,
    options: Vec<SegmentedOption<T>>,
    selected: T,
    disabled: bool,
    on_change: Option<SegmentedChangeHandler<T>>,
}

impl<T: Clone + PartialEq + 'static> SegmentedControl<T> {
    pub fn new(id: impl Into<ElementId>, options: Vec<SegmentedOption<T>>, selected: T) -> Self {
        Self {
            id: id.into(),
            options,
            selected,
            disabled: false,
            on_change: None,
        }
    }

    pub fn disabled(mut self, disabled: bool) -> Self {
        self.disabled = disabled;
        self
    }

    pub fn on_change(mut self, handler: impl Fn(&T, &mut Window, &mut App) + 'static) -> Self {
        self.on_change = Some(Rc::new(handler));
        self
    }
}

impl<T: Clone + PartialEq + 'static> RenderOnce for SegmentedControl<T> {
    fn render(self, _window: &mut Window, cx: &mut App) -> impl IntoElement {
        let theme = ActiveTheme::current(cx);
        let hover_bg = theme.toolbar_hover_background();
        let active_bg = theme.input_option_active_background();
        let active_border = theme.input_option_active_border();
        let active_fg = theme.input_option_active_foreground();
        let idle_fg = theme.input_foreground();

        let mut container = div()
            .id(self.id)
            .flex()
            .items_center()
            .gap(rem_px(2.0))
            .p(rem_px(2.0))
            .bg(theme.input_background())
            .border_1()
            .border_color(theme.input_border())
            .rounded(rem_px(theme.metrics.corner_radius_medium));

        if self.disabled {
            container = container.opacity(0.45);
        }

        for (index, option) in self.options.into_iter().enumerate() {
            let is_active = option.value == self.selected;
            let fg = if is_active { active_fg } else { idle_fg };
            let bg = if is_active {
                active_bg
            } else {
                transparent_black()
            };
            let border = if is_active {
                active_border
            } else {
                transparent_black()
            };

            let mut item = div()
                .id(("segmented-option", index))
                .flex()
                .items_center()
                .justify_center()
                .gap(rem_px(5.0))
                .min_h(rem_px(22.0))
                .px(rem_px(10.0))
                .py(rem_px(2.0))
                .text_size(rem_px(12.0))
                .line_height(rem_px(18.0))
                .whitespace_nowrap()
                .text_color(fg)
                .bg(bg)
                .border_1()
                .border_color(border)
                .rounded(rem_px(theme.metrics.corner_radius_small));

            if let Some(icon_kind) = option.icon {
                item = item.child(codicon(icon_kind, 14.0, fg).size(rem_px(14.0)));
            }
            item = item.child(option.label);

            if let Some(tooltip_text) = option.tooltip {
                item = item.tooltip(baseapp_tooltip(tooltip_text));
            }

            if !self.disabled {
                item = item.cursor_pointer();
                if !is_active {
                    item = item.hover(move |style| style.bg(hover_bg));
                }
                if let Some(handler) = self.on_change.clone() {
                    let value = option.value;
                    item = item.on_click(move |_event, window, cx| {
                        handler(&value, window, cx);
                    });
                }
            }

            container = container.child(item);
        }

        container
    }
}
