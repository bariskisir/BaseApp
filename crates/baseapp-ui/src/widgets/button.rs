use std::rc::Rc;

use gpui::{
    App, ClickEvent, ElementId, IntoElement, RenderOnce, SharedString, Window, div, prelude::*,
    transparent_black,
};

use crate::icon::{Codicon, codicon};
use crate::theme::{ActiveTheme, rem_px};
use crate::widgets::tooltip::baseapp_tooltip;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ButtonVariant {
    #[default]
    Primary,
    Secondary,
    Danger,
    Icon,
    Ghost,
}

type ClickHandler = Rc<dyn Fn(&ClickEvent, &mut Window, &mut App)>;

#[derive(IntoElement)]
pub struct Button {
    id: ElementId,
    variant: ButtonVariant,
    label: Option<SharedString>,
    icon: Option<Codicon>,
    small: bool,
    disabled: bool,
    loading: bool,
    active: bool,
    tooltip: Option<SharedString>,
    on_click: Option<ClickHandler>,
}

impl Button {
    pub fn new(id: impl Into<ElementId>) -> Self {
        Self {
            id: id.into(),
            variant: ButtonVariant::Primary,
            label: None,
            icon: None,
            small: false,
            disabled: false,
            loading: false,
            active: false,
            tooltip: None,
            on_click: None,
        }
    }

    pub fn variant(mut self, variant: ButtonVariant) -> Self {
        self.variant = variant;
        self
    }

    pub fn primary(mut self) -> Self {
        self.variant = ButtonVariant::Primary;
        self
    }

    pub fn secondary(mut self) -> Self {
        self.variant = ButtonVariant::Secondary;
        self
    }

    pub fn danger(mut self) -> Self {
        self.variant = ButtonVariant::Danger;
        self
    }

    pub fn icon_variant(mut self) -> Self {
        self.variant = ButtonVariant::Icon;
        self
    }

    pub fn ghost(mut self) -> Self {
        self.variant = ButtonVariant::Ghost;
        self
    }

    pub fn label(mut self, label: impl Into<SharedString>) -> Self {
        self.label = Some(label.into());
        self
    }

    pub fn icon(mut self, icon: Codicon) -> Self {
        self.icon = Some(icon);
        self
    }

    pub fn small(mut self, small: bool) -> Self {
        self.small = small;
        self
    }

    pub fn disabled(mut self, disabled: bool) -> Self {
        self.disabled = disabled;
        self
    }

    pub fn loading(mut self, loading: bool) -> Self {
        self.loading = loading;
        self
    }

    pub fn active(mut self, active: bool) -> Self {
        self.active = active;
        self
    }

    pub fn tooltip(mut self, tooltip: impl Into<SharedString>) -> Self {
        self.tooltip = Some(tooltip.into());
        self
    }

    pub fn on_click(
        mut self,
        handler: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
    ) -> Self {
        self.on_click = Some(Rc::new(handler));
        self
    }
}

impl RenderOnce for Button {
    fn render(self, _window: &mut Window, cx: &mut App) -> impl IntoElement {
        let theme = ActiveTheme::current(cx);
        let is_disabled = self.disabled || self.loading;

        let (bg, fg, border, hover_bg) = match self.variant {
            ButtonVariant::Primary => (
                theme.button_background(),
                theme.button_foreground(),
                theme.button_border(),
                theme.button_hover_background(),
            ),
            ButtonVariant::Secondary => (
                theme.button_secondary_background(),
                theme.button_secondary_foreground(),
                theme.button_border(),
                theme.button_secondary_hover_background(),
            ),
            ButtonVariant::Danger => (
                theme.button_danger_background(),
                theme.button_foreground(),
                transparent_black(),
                theme.button_danger_hover_background(),
            ),
            ButtonVariant::Icon => (
                if self.active {
                    theme.toolbar_active_background()
                } else {
                    transparent_black()
                },
                theme.icon_foreground(),
                transparent_black(),
                theme.toolbar_hover_background(),
            ),
            ButtonVariant::Ghost => (
                if self.active {
                    theme.toolbar_active_background()
                } else {
                    transparent_black()
                },
                theme.foreground(),
                transparent_black(),
                theme.toolbar_hover_background(),
            ),
        };

        let mut element = div()
            .id(self.id)
            .flex()
            .items_center()
            .justify_center()
            .flex_shrink_0()
            .max_w_full()
            .overflow_hidden()
            .text_size(rem_px(12.0))
            .line_height(rem_px(18.0))
            .text_color(fg)
            .bg(bg)
            .border_1()
            .border_color(border)
            .rounded(rem_px(theme.metrics.corner_radius_medium))
            .whitespace_nowrap();

        element = match (self.variant, self.small) {
            (ButtonVariant::Icon, false) => element
                .min_w(rem_px(24.0))
                .min_h(rem_px(24.0))
                .p(rem_px(3.0))
                .gap(rem_px(4.0)),
            (ButtonVariant::Icon, true) => element
                .min_w(rem_px(22.0))
                .min_h(rem_px(22.0))
                .p(rem_px(2.0))
                .gap(rem_px(4.0)),
            (_, false) => element
                .min_h(rem_px(26.0))
                .px(rem_px(10.0))
                .py(rem_px(4.0))
                .gap(rem_px(6.0)),
            (_, true) => element
                .min_h(rem_px(22.0))
                .px(rem_px(8.0))
                .py(rem_px(2.0))
                .gap(rem_px(4.0)),
        };

        if is_disabled {
            element = element.opacity(0.45);
        } else {
            element = element
                .cursor_pointer()
                .hover(move |style| style.bg(hover_bg));
            if let Some(handler) = self.on_click {
                element = element.on_click(move |event, window, cx| {
                    handler(event, window, cx);
                });
            }
        }

        if let Some(tooltip_text) = self.tooltip {
            element = element.tooltip(baseapp_tooltip(tooltip_text));
        }

        let icon_to_show = if self.loading {
            Some(Codicon::Loading)
        } else {
            self.icon
        };
        let icon_px = if self.small { 14.0 } else { 15.0 };

        if let Some(icon_kind) = icon_to_show {
            element = element.child(
                codicon(icon_kind, icon_px, fg)
                    .size(rem_px(icon_px))
                    .flex_shrink_0(),
            );
        }

        if let Some(label_text) = self.label {
            element = element.child(
                div()
                    .min_w_0()
                    .overflow_hidden()
                    .text_ellipsis()
                    .child(label_text),
            );
        }

        element
    }
}
