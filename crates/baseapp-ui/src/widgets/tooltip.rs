use gpui::{
    AnyView, App, AppContext, BoxShadow, Context, Render, SharedString, Window, div, point,
    prelude::*, px,
};

use crate::theme::{ActiveTheme, rem_px};

pub struct BaseAppTooltip {
    text: SharedString,
}

impl BaseAppTooltip {
    pub fn new(text: impl Into<SharedString>) -> Self {
        Self { text: text.into() }
    }

    pub fn text(&self) -> &SharedString {
        &self.text
    }
}

impl Render for BaseAppTooltip {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ActiveTheme::current(cx);
        let shadow = BoxShadow {
            color: theme.widget_shadow(),
            offset: point(px(0.0), px(2.0)),
            blur_radius: px(8.0),
            spread_radius: px(0.0),
            inset: false,
        };

        div()
            .max_w(rem_px(320.0))
            .px(rem_px(8.0))
            .py(rem_px(4.0))
            .text_size(rem_px(12.0))
            .line_height(rem_px(17.0))
            .text_color(theme.foreground())
            .bg(theme.tooltip_background())
            .border_1()
            .border_color(theme.tooltip_border())
            .rounded(rem_px(theme.metrics.corner_radius_medium))
            .shadow(vec![shadow])
            .child(self.text.clone())
    }
}

pub fn baseapp_tooltip(
    text: impl Into<SharedString>,
) -> impl Fn(&mut Window, &mut App) -> AnyView + 'static {
    let text = text.into();
    move |_window, cx| cx.new(|_| BaseAppTooltip::new(text.clone())).into()
}
