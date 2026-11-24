use std::rc::Rc;

use gpui::{
    AnyElement, App, BoxShadow, Entity, FontWeight, MouseButton, SharedString, Window, div, point,
    prelude::*, px,
};

use crate::icon::{Codicon, codicon};
use crate::theme::{ActiveTheme, rem_px};
use crate::widgets::button::{Button, ButtonVariant};
use crate::widgets::input_box::{InputBox, InputBoxState};

type DialogActionHandler = Rc<dyn Fn(&mut Window, &mut App)>;
type PromptConfirmHandler = Rc<dyn Fn(String, &mut Window, &mut App)>;

#[derive(Clone)]
pub struct ConfirmDialogModel {
    pub title: SharedString,
    pub detail: Option<SharedString>,
    pub confirm_label: SharedString,
    pub cancel_label: SharedString,
    pub danger: bool,
    pub on_confirm: DialogActionHandler,
    pub on_cancel: DialogActionHandler,
}

#[derive(Clone)]
pub struct PromptDialogModel {
    pub title: SharedString,
    pub detail: Option<SharedString>,
    pub confirm_label: SharedString,
    pub cancel_label: SharedString,
    pub max_length: usize,
    pub input: Entity<InputBoxState>,
    pub on_confirm: PromptConfirmHandler,
    pub on_cancel: DialogActionHandler,
}

#[derive(Clone)]
pub enum DialogModel {
    Confirm(ConfirmDialogModel),
    Prompt(PromptDialogModel),
}

pub fn validate_prompt_value(value: &str, max_length: usize) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.chars().count() > max_length {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub fn render_dialog_overlay(
    dialog: &DialogModel,
    theme: &ActiveTheme,
    _window: &mut Window,
    cx: &mut App,
) -> AnyElement {
    let shadow = BoxShadow {
        color: theme.widget_shadow(),
        offset: point(px(0.0), px(10.0)),
        blur_radius: px(32.0),
        spread_radius: px(0.0),
        inset: false,
    };

    let (title, detail, cancel_label, confirm_label, danger, icon_kind, icon_color, on_cancel) =
        match dialog {
            DialogModel::Confirm(model) => (
                model.title.clone(),
                model.detail.clone(),
                model.cancel_label.clone(),
                model.confirm_label.clone(),
                model.danger,
                if model.danger {
                    Codicon::Warning
                } else {
                    Codicon::Info
                },
                if model.danger {
                    theme.warning_foreground()
                } else {
                    theme.info_foreground()
                },
                model.on_cancel.clone(),
            ),
            DialogModel::Prompt(model) => (
                model.title.clone(),
                model.detail.clone(),
                model.cancel_label.clone(),
                model.confirm_label.clone(),
                false,
                Codicon::Edit,
                theme.info_foreground(),
                model.on_cancel.clone(),
            ),
        };

    let mut content = div()
        .flex()
        .flex_col()
        .gap(rem_px(8.0))
        .flex_1()
        .min_w_0()
        .pr(rem_px(16.0))
        .child(
            div()
                .text_size(rem_px(14.0))
                .line_height(rem_px(20.0))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(theme.foreground())
                .child(title),
        );

    if let Some(detail_text) = detail {
        content = content.child(
            div()
                .text_size(rem_px(13.0))
                .line_height(rem_px(18.0))
                .text_color(theme.description_foreground())
                .child(detail_text),
        );
    }

    let (confirm_disabled, confirm_button) = match dialog {
        DialogModel::Confirm(model) => {
            let on_confirm = model.on_confirm.clone();
            let variant = if danger {
                ButtonVariant::Danger
            } else {
                ButtonVariant::Primary
            };
            (
                false,
                Button::new("dialog-confirm")
                    .variant(variant)
                    .label(confirm_label)
                    .on_click(move |_event, window, cx| on_confirm(window, cx)),
            )
        }
        DialogModel::Prompt(model) => {
            let raw_value = model.input.read(cx).value().to_string();
            let trimmed_len = raw_value.trim().chars().count();
            let validated = validate_prompt_value(&raw_value, model.max_length);
            let is_valid = validated.is_some();

            content = content.child(
                div()
                    .mt(rem_px(4.0))
                    .flex()
                    .flex_col()
                    .gap(rem_px(4.0))
                    .child(InputBox::new(model.input.clone()))
                    .child(
                        div()
                            .flex()
                            .justify_end()
                            .text_size(rem_px(11.0))
                            .text_color(if trimmed_len > model.max_length {
                                theme.error_foreground()
                            } else {
                                theme.description_foreground()
                            })
                            .child(format!("{trimmed_len} / {}", model.max_length)),
                    ),
            );

            let input_entity = model.input.clone();
            let max_length = model.max_length;
            let on_confirm = model.on_confirm.clone();
            (
                !is_valid,
                Button::new("dialog-confirm")
                    .primary()
                    .label(confirm_label)
                    .disabled(!is_valid)
                    .on_click(move |_event, window, cx| {
                        let current = input_entity.read(cx).value().to_string();
                        if let Some(clean) = validate_prompt_value(&current, max_length) {
                            on_confirm(clean, window, cx);
                        }
                    }),
            )
        }
    };

    let _ = confirm_disabled;
    let cancel_close = on_cancel.clone();
    let cancel_btn = on_cancel.clone();
    let cancel_backdrop = on_cancel;

    let card = div()
        .relative()
        .flex()
        .flex_col()
        .w(rem_px(420.0))
        .max_w(rem_px(440.0))
        .min_w(rem_px(300.0))
        .bg(theme.dialog_background())
        .text_color(theme.foreground())
        .border_1()
        .border_color(theme.dialog_border())
        .rounded(rem_px(theme.metrics.corner_radius_large))
        .shadow(vec![shadow])
        .on_mouse_down(MouseButton::Left, |_event, _window, cx| {
            cx.stop_propagation();
        })
        .child(
            div()
                .absolute()
                .top(rem_px(10.0))
                .right(rem_px(10.0))
                .child(
                    Button::new("dialog-close")
                        .icon_variant()
                        .small(true)
                        .icon(Codicon::Close)
                        .on_click(move |_event, window, cx| cancel_close(window, cx)),
                ),
        )
        .child(
            div()
                .flex()
                .items_start()
                .gap(rem_px(14.0))
                .pt(rem_px(20.0))
                .px(rem_px(24.0))
                .pb(rem_px(16.0))
                .child(
                    div()
                        .mt(rem_px(2.0))
                        .flex_shrink_0()
                        .child(codicon(icon_kind, 20.0, icon_color).size(rem_px(20.0))),
                )
                .child(content),
        )
        .child(
            div()
                .flex()
                .items_center()
                .justify_end()
                .gap(rem_px(8.0))
                .pt(rem_px(12.0))
                .px(rem_px(24.0))
                .pb(rem_px(18.0))
                .child(
                    Button::new("dialog-cancel")
                        .secondary()
                        .label(cancel_label)
                        .on_click(move |_event, window, cx| cancel_btn(window, cx)),
                )
                .child(confirm_button),
        );

    div()
        .id("dialog-modal-backdrop")
        .absolute()
        .inset_0()
        .flex()
        .items_center()
        .justify_center()
        .p(rem_px(24.0))
        .bg(theme.widget_shadow())
        .on_mouse_down(MouseButton::Left, move |_event, window, cx| {
            cancel_backdrop(window, cx);
            cx.stop_propagation();
        })
        .child(card)
        .into_any_element()
}
