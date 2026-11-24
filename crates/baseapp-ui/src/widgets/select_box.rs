use std::rc::Rc;

use gpui::{
    Anchor, App, BoxShadow, ClickEvent, Context, ElementId, Entity, EventEmitter, FocusHandle,
    Focusable, IntoElement, KeyDownEvent, MouseButton, Render, RenderOnce, SharedString, Window,
    anchored, deferred, div, point, prelude::*, px,
};

use crate::icon::{Codicon, codicon};
use crate::theme::{ActiveTheme, rem_px};
use crate::widgets::context_menu::ContextMenuEntry;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SelectOption<T> {
    pub value: T,
    pub label: SharedString,
}

impl<T> SelectOption<T> {
    pub fn new(value: T, label: impl Into<SharedString>) -> Self {
        Self {
            value,
            label: label.into(),
        }
    }
}

type TriggerClickHandler = Rc<dyn Fn(&ClickEvent, &mut Window, &mut App)>;

#[derive(IntoElement)]
pub struct SelectTrigger {
    id: ElementId,
    label: SharedString,
    open: bool,
    disabled: bool,
    min_width: f32,
    on_click: Option<TriggerClickHandler>,
}

impl SelectTrigger {
    pub fn new(id: impl Into<ElementId>, label: impl Into<SharedString>) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            open: false,
            disabled: false,
            min_width: 140.0,
            on_click: None,
        }
    }

    pub fn open(mut self, open: bool) -> Self {
        self.open = open;
        self
    }

    pub fn disabled(mut self, disabled: bool) -> Self {
        self.disabled = disabled;
        self
    }

    pub fn min_width(mut self, min_width_px: f32) -> Self {
        self.min_width = min_width_px;
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

impl RenderOnce for SelectTrigger {
    fn render(self, _window: &mut Window, cx: &mut App) -> impl IntoElement {
        let theme = ActiveTheme::current(cx);
        let border_color = if self.open && !self.disabled {
            theme.focus_border()
        } else {
            theme.dropdown_border()
        };
        let focus_border = theme.focus_border();

        let mut button = div()
            .id(self.id)
            .flex()
            .items_center()
            .justify_between()
            .gap(rem_px(8.0))
            .min_w(rem_px(self.min_width))
            .min_h(rem_px(26.0))
            .pl(rem_px(8.0))
            .pr(rem_px(6.0))
            .py(rem_px(2.0))
            .text_size(rem_px(13.0))
            .line_height(rem_px(20.0))
            .text_color(theme.dropdown_foreground())
            .bg(theme.dropdown_background())
            .border_1()
            .border_color(border_color)
            .rounded(rem_px(theme.metrics.corner_radius_small))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .overflow_hidden()
                    .whitespace_nowrap()
                    .child(self.label),
            )
            .child(codicon(Codicon::ChevronDown, 14.0, theme.icon_foreground()).size(rem_px(14.0)));

        if self.disabled {
            button = button.opacity(0.45);
        } else {
            button = button
                .cursor_pointer()
                .hover(move |style| style.border_color(focus_border));
            if let Some(handler) = self.on_click {
                button = button.on_click(move |event, window, cx| {
                    handler(event, window, cx);
                });
            }
        }

        button
    }
}

pub fn select_trigger(
    id: impl Into<ElementId>,
    label: impl Into<SharedString>,
    open: bool,
    disabled: bool,
    on_click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> SelectTrigger {
    SelectTrigger::new(id, label)
        .open(open)
        .disabled(disabled)
        .on_click(on_click)
}

pub fn select_options_to_menu_entries<T: Clone + PartialEq + 'static>(
    options: &[SelectOption<T>],
    selected: &T,
    on_select: impl Fn(T, &mut Window, &mut App) + 'static,
) -> Vec<ContextMenuEntry> {
    let callback = Rc::new(on_select);
    options
        .iter()
        .enumerate()
        .map(|(index, option)| {
            let value = option.value.clone();
            let cb = callback.clone();
            let is_selected = &option.value == selected;
            ContextMenuEntry::action(
                ("select-menu-option", index),
                option.label.clone(),
                move |window, cx| cb(value.clone(), window, cx),
            )
            .with_checked(is_selected)
        })
        .collect()
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SelectBoxEvent<T> {
    pub value: T,
}

type SelectChangeHandler<T> = Rc<dyn Fn(&T, &mut Window, &mut App)>;

pub struct SelectBoxState<T: Clone + PartialEq + 'static> {
    focus_handle: FocusHandle,
    options: Vec<SelectOption<T>>,
    selected: T,
    open: bool,
    disabled: bool,
    min_width: f32,
    on_change: Option<SelectChangeHandler<T>>,
}

impl<T: Clone + PartialEq + 'static> EventEmitter<SelectBoxEvent<T>> for SelectBoxState<T> {}

impl<T: Clone + PartialEq + 'static> SelectBoxState<T> {
    pub fn new(options: Vec<SelectOption<T>>, selected: T, cx: &mut Context<Self>) -> Self {
        Self {
            focus_handle: cx.focus_handle(),
            options,
            selected,
            open: false,
            disabled: false,
            min_width: 140.0,
            on_change: None,
        }
    }

    pub fn with_disabled(mut self, disabled: bool) -> Self {
        self.disabled = disabled;
        self
    }

    pub fn with_min_width(mut self, min_width_px: f32) -> Self {
        self.min_width = min_width_px;
        self
    }

    pub fn with_on_change(mut self, handler: impl Fn(&T, &mut Window, &mut App) + 'static) -> Self {
        self.on_change = Some(Rc::new(handler));
        self
    }

    pub fn selected(&self) -> &T {
        &self.selected
    }

    pub fn is_open(&self) -> bool {
        self.open
    }

    pub fn is_disabled(&self) -> bool {
        self.disabled
    }

    pub fn set_selected(&mut self, value: T, cx: &mut Context<Self>) {
        self.selected = value;
        cx.notify();
    }

    pub fn set_options(&mut self, options: Vec<SelectOption<T>>, cx: &mut Context<Self>) {
        self.options = options;
        cx.notify();
    }

    pub fn set_disabled(&mut self, disabled: bool, cx: &mut Context<Self>) {
        self.disabled = disabled;
        if disabled {
            self.open = false;
        }
        cx.notify();
    }

    pub fn toggle(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.disabled {
            return;
        }
        self.open = !self.open;
        if self.open {
            self.focus_handle.focus(window, cx);
        }
        cx.notify();
    }

    pub fn close(&mut self, cx: &mut Context<Self>) {
        if self.open {
            self.open = false;
            cx.notify();
        }
    }

    fn choose(&mut self, value: T, window: &mut Window, cx: &mut Context<Self>) {
        let changed = self.selected != value;
        self.selected = value.clone();
        self.open = false;
        if changed {
            cx.emit(SelectBoxEvent {
                value: value.clone(),
            });
            if let Some(handler) = self.on_change.clone() {
                handler(&value, window, cx);
            }
        }
        cx.notify();
    }

    fn selected_label(&self) -> SharedString {
        self.options
            .iter()
            .find(|option| option.value == self.selected)
            .map(|option| option.label.clone())
            .unwrap_or_default()
    }
}

impl<T: Clone + PartialEq + 'static> Focusable for SelectBoxState<T> {
    fn focus_handle(&self, _cx: &App) -> FocusHandle {
        self.focus_handle.clone()
    }
}

impl<T: Clone + PartialEq + 'static> Render for SelectBoxState<T> {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ActiveTheme::current(cx);
        let label = self.selected_label();
        let is_open = self.open && !self.disabled;
        let entity = cx.entity();

        let trigger = SelectTrigger::new("select-box-trigger", label)
            .open(is_open)
            .disabled(self.disabled)
            .min_width(self.min_width)
            .on_click(move |_event, window, cx| {
                entity.update(cx, |this, cx| this.toggle(window, cx));
            });

        let mut wrapper = div()
            .relative()
            .track_focus(&self.focus_handle)
            .on_key_down(cx.listener(|this, event: &KeyDownEvent, _window, cx| {
                if event.keystroke.key == "escape" {
                    this.close(cx);
                }
            }))
            .child(trigger);

        if is_open {
            let shadow = BoxShadow {
                color: theme.widget_shadow(),
                offset: point(px(0.0), px(4.0)),
                blur_radius: px(12.0),
                spread_radius: px(0.0),
                inset: false,
            };
            let hover_bg = theme.menu_selection_background();
            let hover_fg = theme.menu_selection_foreground();
            let fg = theme.dropdown_foreground();

            let mut list = div()
                .id("select-box-dropdown")
                .flex()
                .flex_col()
                .min_w(rem_px(self.min_width))
                .max_h(rem_px(240.0))
                .overflow_y_scroll()
                .py(rem_px(2.0))
                .bg(theme.dropdown_list_background())
                .text_color(fg)
                .border_1()
                .border_color(theme.dropdown_border())
                .rounded(rem_px(theme.metrics.corner_radius_small))
                .shadow(vec![shadow])
                .on_mouse_down_out(cx.listener(|this, _event, _window, cx| {
                    this.close(cx);
                }))
                .on_mouse_down(MouseButton::Left, |_event, _window, cx| {
                    cx.stop_propagation();
                });

            for (index, option) in self.options.iter().enumerate() {
                let is_selected = option.value == self.selected;
                let value = option.value.clone();
                let mut row = div()
                    .id(("select-box-option", index))
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap(rem_px(8.0))
                    .px(rem_px(8.0))
                    .py(rem_px(4.0))
                    .text_size(rem_px(13.0))
                    .line_height(rem_px(20.0))
                    .text_color(fg)
                    .cursor_pointer()
                    .hover(move |style| style.bg(hover_bg).text_color(hover_fg))
                    .on_click(cx.listener(move |this, _event, window, cx| {
                        this.choose(value.clone(), window, cx);
                    }))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .overflow_hidden()
                            .whitespace_nowrap()
                            .child(option.label.clone()),
                    );

                if is_selected {
                    row = row.child(codicon(Codicon::Check, 13.0, fg).size(rem_px(13.0)));
                }

                list = list.child(row);
            }

            wrapper = wrapper.child(deferred(
                anchored()
                    .anchor(Anchor::TopLeft)
                    .snap_to_window_with_margin(px(4.0))
                    .child(div().mt(rem_px(2.0)).child(list)),
            ));
        }

        wrapper
    }
}

#[derive(IntoElement)]
pub struct SelectBox<T: Clone + PartialEq + 'static> {
    state: Entity<SelectBoxState<T>>,
}

impl<T: Clone + PartialEq + 'static> SelectBox<T> {
    pub fn new(state: Entity<SelectBoxState<T>>) -> Self {
        Self { state }
    }
}

impl<T: Clone + PartialEq + 'static> RenderOnce for SelectBox<T> {
    fn render(self, _window: &mut Window, _cx: &mut App) -> impl IntoElement {
        self.state
    }
}
