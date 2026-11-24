use gpui::{App, IntoElement, RenderOnce, Window, div, prelude::*, relative};

use crate::theme::{ActiveTheme, rem_px};

#[derive(IntoElement)]
pub struct ProgressBar {
    progress: Option<f32>,
    active: bool,
}

impl ProgressBar {
    pub fn new(progress: Option<f32>) -> Self {
        Self {
            progress,
            active: true,
        }
    }

    pub fn determinate(progress: f32) -> Self {
        Self::new(Some(progress))
    }

    pub fn indeterminate() -> Self {
        Self::new(None)
    }

    pub fn active(mut self, active: bool) -> Self {
        self.active = active;
        self
    }
}

impl RenderOnce for ProgressBar {
    fn render(self, _window: &mut Window, cx: &mut App) -> impl IntoElement {
        let theme = ActiveTheme::current(cx);

        let mut container = div()
            .relative()
            .w_full()
            .h(rem_px(2.0))
            .overflow_hidden()
            .bg(theme.border_default());

        if !self.active {
            return container.opacity(0.0);
        }

        let bar = match self.progress {
            Some(percent) => {
                let fraction = if percent.is_finite() {
                    (percent / 100.0).clamp(0.0, 1.0)
                } else {
                    0.0
                };
                div()
                    .absolute()
                    .top_0()
                    .left_0()
                    .h_full()
                    .w(relative(fraction))
                    .bg(theme.progress_bar_background())
            }
            None => div()
                .absolute()
                .top_0()
                .left(relative(0.325))
                .h_full()
                .w(relative(0.35))
                .bg(theme.progress_bar_background()),
        };

        container = container.child(bar);
        container
    }
}
