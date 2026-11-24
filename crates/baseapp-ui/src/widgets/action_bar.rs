use std::rc::Rc;

use gpui::{
    App, ClickEvent, ElementId, IntoElement, RenderOnce, SharedString, Window, div, prelude::*,
    transparent_black,
};

use crate::icon::{Codicon, codicon};
use crate::theme::{ActiveTheme, rem_px};
use crate::widgets::tooltip::baseapp_tooltip;

type ActionClickHandler = Rc<dyn Fn(&ClickEvent, &mut Window, &mut App)>;

pub struct ActionBarItem {
    pub id: ElementId,
    pub icon: Codicon,
    pub title: SharedString,
    pub danger: bool,
    pub disabled: bool,
    pub active: bool,
    pub on_click: ActionClickHandler,
}

impl ActionBarItem {
    pub fn new(
        id: impl Into<ElementId>,
        icon: Codicon,
        title: impl Into<SharedString>,
        on_click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
    ) -> Self {
        Self {
            id: id.into(),
            icon,
            title: title.into(),
            danger: false,
            disabled: false,
            active: false,
            on_click: Rc::new(on_click),
        }
    }

    pub fn danger(mut self, danger: bool) -> Self {
        self.danger = danger;
        self
    }

    pub fn disabled(mut self, disabled: bool) -> Self {
        self.disabled = disabled;
        self
    }

    pub fn active(mut self, active: bool) -> Self {
        self.active = active;
        self
    }
}

#[derive(IntoElement)]
pub struct ActionBar {
    items: Vec<ActionBarItem>,
    vertical: bool,
}

impl ActionBar {
    pub fn new(items: Vec<ActionBarItem>) -> Self {
        Self {
            items,
            vertical: false,
        }
    }

    pub fn vertical(mut self, vertical: bool) -> Self {
        self.vertical = vertical;
        self
    }
}

impl RenderOnce for ActionBar {
    fn render(self, _window: &mut Window, cx: &mut App) -> impl IntoElement {
        let theme = ActiveTheme::current(cx);
        let hover_bg = theme.toolbar_hover_background();
        let active_bg = theme.toolbar_active_background();
        let icon_fg = theme.icon_foreground();
        let active_fg = theme.foreground();
        let danger_fg = theme.error_foreground();

        let mut bar = div().flex().items_center().gap(rem_px(2.0));
        if self.vertical {
            bar = bar.flex_col();
        }

        for item in self.items {
            let fg = if item.danger {
                danger_fg
            } else if item.active {
                active_fg
            } else {
                icon_fg
            };
            let bg = if item.active {
                active_bg
            } else {
                transparent_black()
            };

            let mut button = div()
                .id(item.id)
                .flex()
                .items_center()
                .justify_center()
                .flex_shrink_0()
                .size(rem_px(22.0))
                .rounded(rem_px(theme.metrics.corner_radius_medium))
                .bg(bg)
                .tooltip(baseapp_tooltip(item.title))
                .child(codicon(item.icon, 14.0, fg).size(rem_px(14.0)));

            if item.disabled {
                button = button.opacity(0.4);
            } else {
                let handler = item.on_click;
                button = button
                    .cursor_pointer()
                    .hover(move |style| style.bg(hover_bg))
                    .on_click(move |event, window, cx| {
                        handler(event, window, cx);
                    });
            }

            bar = bar.child(button);
        }

        bar
    }
}
