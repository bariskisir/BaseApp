use std::ops::Range;

use gpui::{
    App, Bounds, ClipboardItem, Context, CursorStyle, Element, ElementId, ElementInputHandler,
    Entity, EventEmitter, FocusHandle, Focusable, GlobalElementId, Hitbox, HitboxBehavior,
    InspectorElementId, IntoElement, KeyBinding, LayoutId, MouseButton, MouseDownEvent,
    MouseMoveEvent, MouseUpEvent, PaintQuad, Pixels, Point, Render, RenderOnce, ShapedLine,
    SharedString, Style, TextAlign, TextRun, UTF16Selection, UnderlineStyle, Window, actions, div,
    fill, point, prelude::*, px, relative, size,
};

use crate::icon::{Codicon, codicon};
use crate::theme::{ActiveTheme, rem_px};

pub const INPUT_KEY_CONTEXT: &str = "BaseAppInputBox";

actions!(
    baseapp_input,
    [
        InputBackspace,
        InputDelete,
        InputLeft,
        InputRight,
        InputSelectLeft,
        InputSelectRight,
        InputSelectAll,
        InputHome,
        InputEnd,
        InputCopy,
        InputCut,
        InputPaste,
        InputEnter,
        InputEscape,
    ]
);

pub fn register_input_keybindings(cx: &mut App) {
    let ctx = Some(INPUT_KEY_CONTEXT);
    let mut bindings = vec![
        KeyBinding::new("backspace", InputBackspace, ctx),
        KeyBinding::new("delete", InputDelete, ctx),
        KeyBinding::new("left", InputLeft, ctx),
        KeyBinding::new("right", InputRight, ctx),
        KeyBinding::new("shift-left", InputSelectLeft, ctx),
        KeyBinding::new("shift-right", InputSelectRight, ctx),
        KeyBinding::new("home", InputHome, ctx),
        KeyBinding::new("end", InputEnd, ctx),
        KeyBinding::new("enter", InputEnter, ctx),
        KeyBinding::new("escape", InputEscape, ctx),
    ];

    #[cfg(target_os = "macos")]
    {
        bindings.extend([
            KeyBinding::new("cmd-a", InputSelectAll, ctx),
            KeyBinding::new("cmd-c", InputCopy, ctx),
            KeyBinding::new("cmd-x", InputCut, ctx),
            KeyBinding::new("cmd-v", InputPaste, ctx),
        ]);
    }

    #[cfg(not(target_os = "macos"))]
    {
        bindings.extend([
            KeyBinding::new("ctrl-a", InputSelectAll, ctx),
            KeyBinding::new("ctrl-c", InputCopy, ctx),
            KeyBinding::new("ctrl-x", InputCut, ctx),
            KeyBinding::new("ctrl-v", InputPaste, ctx),
        ]);
    }

    cx.bind_keys(bindings);
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InputBoxEvent {
    Changed(String),
    Submit(String),
    Escape,
}

fn clamp_char_boundary(text: &str, mut index: usize) -> usize {
    if index >= text.len() {
        return text.len();
    }
    while index > 0 && !text.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn sanitize_single_line(text: &str) -> String {
    text.chars()
        .filter(|ch| *ch != '\r' && *ch != '\n')
        .collect()
}

pub struct InputBoxState {
    focus_handle: FocusHandle,
    content: String,
    placeholder: SharedString,
    selected_range: Range<usize>,
    selection_reversed: bool,
    marked_range: Option<Range<usize>>,
    prefix_icon: Option<Codicon>,
    allow_clear: bool,
    disabled: bool,
    max_length: Option<usize>,
    last_layout: Option<ShapedLine>,
    last_bounds: Option<Bounds<Pixels>>,
    is_selecting: bool,
}

impl EventEmitter<InputBoxEvent> for InputBoxState {}

impl InputBoxState {
    pub fn new(cx: &mut Context<Self>) -> Self {
        Self {
            focus_handle: cx.focus_handle(),
            content: String::new(),
            placeholder: SharedString::default(),
            selected_range: 0..0,
            selection_reversed: false,
            marked_range: None,
            prefix_icon: None,
            allow_clear: false,
            disabled: false,
            max_length: None,
            last_layout: None,
            last_bounds: None,
            is_selecting: false,
        }
    }

    pub fn with_value(mut self, value: impl Into<String>) -> Self {
        let mut sanitized = sanitize_single_line(&value.into());
        if let Some(limit) = self.max_length {
            sanitized = sanitized.chars().take(limit).collect();
        }
        let end = sanitized.len();
        self.content = sanitized;
        self.selected_range = end..end;
        self.selection_reversed = false;
        self.marked_range = None;
        self
    }

    pub fn with_placeholder(mut self, placeholder: impl Into<SharedString>) -> Self {
        self.placeholder = placeholder.into();
        self
    }

    pub fn with_prefix_icon(mut self, icon: Codicon) -> Self {
        self.prefix_icon = Some(icon);
        self
    }

    pub fn with_allow_clear(mut self, allow_clear: bool) -> Self {
        self.allow_clear = allow_clear;
        self
    }

    pub fn with_disabled(mut self, disabled: bool) -> Self {
        self.disabled = disabled;
        self
    }

    pub fn with_max_length(mut self, max_length: usize) -> Self {
        self.max_length = Some(max_length);
        if self.content.chars().count() > max_length {
            self.content = self.content.chars().take(max_length).collect();
            let end = self.content.len();
            self.selected_range = end..end;
            self.selection_reversed = false;
            self.marked_range = None;
        }
        self
    }

    pub fn value(&self) -> &str {
        &self.content
    }

    pub fn placeholder(&self) -> &SharedString {
        &self.placeholder
    }

    pub fn is_disabled(&self) -> bool {
        self.disabled
    }

    pub fn selected_range(&self) -> Range<usize> {
        self.selected_range.clone()
    }

    pub fn set_value(&mut self, value: impl Into<String>, cx: &mut Context<Self>) {
        let mut sanitized = sanitize_single_line(&value.into());
        if let Some(limit) = self.max_length {
            sanitized = sanitized.chars().take(limit).collect();
        }
        let changed = self.content != sanitized;
        let end = sanitized.len();
        self.content = sanitized;
        self.selected_range = end..end;
        self.selection_reversed = false;
        self.marked_range = None;
        if changed {
            cx.emit(InputBoxEvent::Changed(self.content.clone()));
        }
        cx.notify();
    }

    pub fn set_placeholder(
        &mut self,
        placeholder: impl Into<SharedString>,
        cx: &mut Context<Self>,
    ) {
        self.placeholder = placeholder.into();
        cx.notify();
    }

    pub fn set_disabled(&mut self, disabled: bool, cx: &mut Context<Self>) {
        self.disabled = disabled;
        cx.notify();
    }

    pub fn clear(&mut self, cx: &mut Context<Self>) {
        if self.disabled {
            return;
        }
        if !self.content.is_empty() {
            self.content.clear();
            self.selected_range = 0..0;
            self.selection_reversed = false;
            self.marked_range = None;
            cx.emit(InputBoxEvent::Changed(String::new()));
            cx.notify();
        }
    }

    pub fn focus(&self, window: &mut Window, cx: &mut App) {
        if !self.disabled {
            self.focus_handle.focus(window, cx);
        }
    }

    pub fn select_all(&mut self, cx: &mut Context<Self>) {
        self.selected_range = 0..self.content.len();
        self.selection_reversed = false;
        cx.notify();
    }

    pub fn insert_text(&mut self, text: &str, cx: &mut Context<Self>) {
        if self.disabled {
            return;
        }
        let target = self
            .marked_range
            .take()
            .unwrap_or_else(|| self.selected_range.clone());
        self.replace_utf8_range(target, text, None, false, cx);
    }

    pub fn backspace(&mut self, cx: &mut Context<Self>) {
        if self.disabled {
            return;
        }
        if self.selected_range.is_empty() {
            let prev = self.previous_boundary(self.selected_range.start);
            if prev < self.selected_range.start {
                self.replace_utf8_range(prev..self.selected_range.start, "", None, false, cx);
            }
        } else {
            let range = self.selected_range.clone();
            self.replace_utf8_range(range, "", None, false, cx);
        }
    }

    pub fn delete_forward(&mut self, cx: &mut Context<Self>) {
        if self.disabled {
            return;
        }
        if self.selected_range.is_empty() {
            let next = self.next_boundary(self.selected_range.end);
            if next > self.selected_range.end {
                self.replace_utf8_range(self.selected_range.end..next, "", None, false, cx);
            }
        } else {
            let range = self.selected_range.clone();
            self.replace_utf8_range(range, "", None, false, cx);
        }
    }

    pub fn move_left(&mut self, select: bool, cx: &mut Context<Self>) {
        if select {
            let next = self.previous_boundary(self.cursor_offset());
            self.select_to(next, cx);
        } else if self.selected_range.is_empty() {
            let next = self.previous_boundary(self.selected_range.start);
            self.move_to(next, cx);
        } else {
            self.move_to(self.selected_range.start, cx);
        }
    }

    pub fn move_right(&mut self, select: bool, cx: &mut Context<Self>) {
        if select {
            let next = self.next_boundary(self.cursor_offset());
            self.select_to(next, cx);
        } else if self.selected_range.is_empty() {
            let next = self.next_boundary(self.selected_range.end);
            self.move_to(next, cx);
        } else {
            self.move_to(self.selected_range.end, cx);
        }
    }

    pub fn move_home(&mut self, select: bool, cx: &mut Context<Self>) {
        if select {
            self.select_to(0, cx);
        } else {
            self.move_to(0, cx);
        }
    }

    pub fn move_end(&mut self, select: bool, cx: &mut Context<Self>) {
        let end = self.content.len();
        if select {
            self.select_to(end, cx);
        } else {
            self.move_to(end, cx);
        }
    }

    pub fn submit(&mut self, cx: &mut Context<Self>) {
        if !self.disabled {
            cx.emit(InputBoxEvent::Submit(self.content.clone()));
        }
    }

    pub fn escape(&mut self, cx: &mut Context<Self>) {
        cx.emit(InputBoxEvent::Escape);
    }

    pub fn offset_to_utf16(&self, byte_offset: usize) -> usize {
        let clamped = clamp_char_boundary(&self.content, byte_offset);
        self.content[..clamped].chars().map(char::len_utf16).sum()
    }

    pub fn offset_from_utf16(&self, utf16_offset: usize) -> usize {
        let mut utf16_count = 0usize;
        for (byte_index, ch) in self.content.char_indices() {
            if utf16_count >= utf16_offset {
                return byte_index;
            }
            utf16_count += ch.len_utf16();
        }
        self.content.len()
    }

    fn range_to_utf16(&self, range: &Range<usize>) -> Range<usize> {
        self.offset_to_utf16(range.start)..self.offset_to_utf16(range.end)
    }

    fn range_from_utf16(&self, range_utf16: &Range<usize>) -> Range<usize> {
        let start = self.offset_from_utf16(range_utf16.start);
        let end = self.offset_from_utf16(range_utf16.end);
        if start <= end { start..end } else { end..start }
    }

    fn cursor_offset(&self) -> usize {
        if self.selection_reversed {
            self.selected_range.start
        } else {
            self.selected_range.end
        }
    }

    fn previous_boundary(&self, byte_offset: usize) -> usize {
        let clamped = clamp_char_boundary(&self.content, byte_offset);
        match self.content[..clamped].chars().next_back() {
            Some(ch) => clamped.saturating_sub(ch.len_utf8()),
            None => 0,
        }
    }

    fn next_boundary(&self, byte_offset: usize) -> usize {
        let clamped = clamp_char_boundary(&self.content, byte_offset);
        match self.content[clamped..].chars().next() {
            Some(ch) => clamped.saturating_add(ch.len_utf8()),
            None => self.content.len(),
        }
    }

    fn move_to(&mut self, offset: usize, cx: &mut Context<Self>) {
        let clamped = clamp_char_boundary(&self.content, offset);
        self.selected_range = clamped..clamped;
        self.selection_reversed = false;
        cx.notify();
    }

    fn select_to(&mut self, offset: usize, cx: &mut Context<Self>) {
        let clamped = clamp_char_boundary(&self.content, offset);
        if self.selection_reversed {
            self.selected_range.start = clamped;
        } else {
            self.selected_range.end = clamped;
        }
        if self.selected_range.end < self.selected_range.start {
            self.selection_reversed = !self.selection_reversed;
            self.selected_range = self.selected_range.end..self.selected_range.start;
        }
        cx.notify();
    }

    fn replace_utf8_range(
        &mut self,
        range: Range<usize>,
        raw_text: &str,
        new_selected_range_utf16: Option<Range<usize>>,
        mark_inserted: bool,
        cx: &mut Context<Self>,
    ) {
        let start = clamp_char_boundary(&self.content, range.start);
        let end = clamp_char_boundary(&self.content, range.end);
        let (start, end) = if start <= end {
            (start, end)
        } else {
            (end, start)
        };

        let mut inserted = sanitize_single_line(raw_text);
        if let Some(limit) = self.max_length {
            let prefix_chars = self.content[..start].chars().count();
            let suffix_chars = self.content[end..].chars().count();
            let allowed = limit.saturating_sub(prefix_chars.saturating_add(suffix_chars));
            if inserted.chars().count() > allowed {
                inserted = inserted.chars().take(allowed).collect();
            }
        }

        let mut updated =
            String::with_capacity(self.content.len() - (end - start) + inserted.len());
        updated.push_str(&self.content[..start]);
        updated.push_str(&inserted);
        updated.push_str(&self.content[end..]);

        let changed = updated != self.content;
        self.content = updated;

        let inserted_end = start + inserted.len();
        self.marked_range = if mark_inserted && !inserted.is_empty() {
            Some(start..inserted_end)
        } else {
            None
        };

        if let Some(rel_utf16) = new_selected_range_utf16 {
            let base_utf16 = self.offset_to_utf16(start);
            let sel_start = self.offset_from_utf16(base_utf16.saturating_add(rel_utf16.start));
            let sel_end = self.offset_from_utf16(base_utf16.saturating_add(rel_utf16.end));
            self.selected_range = if sel_start <= sel_end {
                sel_start..sel_end
            } else {
                sel_end..sel_start
            };
        } else {
            self.selected_range = inserted_end..inserted_end;
        }
        self.selection_reversed = false;

        if changed {
            cx.emit(InputBoxEvent::Changed(self.content.clone()));
        }
        cx.notify();
    }

    fn index_for_mouse_position(&self, position: Point<Pixels>) -> usize {
        if self.content.is_empty() {
            return 0;
        }
        let (Some(bounds), Some(line)) = (self.last_bounds.as_ref(), self.last_layout.as_ref())
        else {
            return self.content.len();
        };
        let local_x = position.x - bounds.left();
        clamp_char_boundary(&self.content, line.closest_index_for_x(local_x))
    }

    fn on_mouse_down(
        &mut self,
        event: &MouseDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.disabled {
            return;
        }
        self.focus_handle.focus(window, cx);
        self.is_selecting = true;
        if event.click_count >= 2 {
            self.select_all(cx);
            return;
        }
        let index = self.index_for_mouse_position(event.position);
        if event.modifiers.shift {
            self.select_to(index, cx);
        } else {
            self.move_to(index, cx);
        }
    }

    fn on_mouse_move(
        &mut self,
        event: &MouseMoveEvent,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.is_selecting && event.pressed_button == Some(MouseButton::Left) {
            let index = self.index_for_mouse_position(event.position);
            self.select_to(index, cx);
        }
    }

    fn on_mouse_up(
        &mut self,
        _event: &MouseUpEvent,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) {
        self.is_selecting = false;
    }

    fn on_copy(&mut self, _: &InputCopy, _window: &mut Window, cx: &mut Context<Self>) {
        if !self.selected_range.is_empty()
            && let Some(slice) = self.content.get(self.selected_range.clone())
        {
            cx.write_to_clipboard(ClipboardItem::new_string(slice.to_string()));
        }
    }

    fn on_cut(&mut self, _: &InputCut, _window: &mut Window, cx: &mut Context<Self>) {
        if self.disabled {
            return;
        }
        if !self.selected_range.is_empty()
            && let Some(slice) = self.content.get(self.selected_range.clone())
        {
            cx.write_to_clipboard(ClipboardItem::new_string(slice.to_string()));
            let range = self.selected_range.clone();
            self.replace_utf8_range(range, "", None, false, cx);
        }
    }

    fn on_paste(&mut self, _: &InputPaste, _window: &mut Window, cx: &mut Context<Self>) {
        if self.disabled {
            return;
        }
        if let Some(text) = cx.read_from_clipboard().and_then(|item| item.text()) {
            self.insert_text(&text, cx);
        }
    }
}

impl Focusable for InputBoxState {
    fn focus_handle(&self, _cx: &App) -> FocusHandle {
        self.focus_handle.clone()
    }
}

impl gpui::EntityInputHandler for InputBoxState {
    fn text_for_range(
        &mut self,
        range_utf16: Range<usize>,
        adjusted_range: &mut Option<Range<usize>>,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<String> {
        let range = self.range_from_utf16(&range_utf16);
        *adjusted_range = Some(self.range_to_utf16(&range));
        self.content.get(range).map(str::to_string)
    }

    fn selected_text_range(
        &mut self,
        _ignore_disabled_input: bool,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<UTF16Selection> {
        Some(UTF16Selection {
            range: self.range_to_utf16(&self.selected_range),
            reversed: self.selection_reversed,
        })
    }

    fn marked_text_range(
        &self,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<Range<usize>> {
        self.marked_range
            .as_ref()
            .map(|range| self.range_to_utf16(range))
    }

    fn unmark_text(&mut self, _window: &mut Window, _cx: &mut Context<Self>) {
        self.marked_range = None;
    }

    fn replace_text_in_range(
        &mut self,
        range_utf16: Option<Range<usize>>,
        new_text: &str,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.disabled {
            return;
        }
        let target = range_utf16
            .as_ref()
            .map(|range| self.range_from_utf16(range))
            .or_else(|| self.marked_range.clone())
            .unwrap_or_else(|| self.selected_range.clone());
        self.replace_utf8_range(target, new_text, None, false, cx);
    }

    fn replace_and_mark_text_in_range(
        &mut self,
        range_utf16: Option<Range<usize>>,
        new_text: &str,
        new_selected_range_utf16: Option<Range<usize>>,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.disabled {
            return;
        }
        let target = range_utf16
            .as_ref()
            .map(|range| self.range_from_utf16(range))
            .or_else(|| self.marked_range.clone())
            .unwrap_or_else(|| self.selected_range.clone());
        self.replace_utf8_range(target, new_text, new_selected_range_utf16, true, cx);
    }

    fn bounds_for_range(
        &mut self,
        range_utf16: Range<usize>,
        bounds: Bounds<Pixels>,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<Bounds<Pixels>> {
        let line = self.last_layout.as_ref()?;
        let range = self.range_from_utf16(&range_utf16);
        let start_x = line.x_for_index(range.start);
        let end_x = line.x_for_index(range.end);
        Some(Bounds::from_corners(
            point(bounds.left() + start_x, bounds.top()),
            point(bounds.left() + end_x, bounds.bottom()),
        ))
    }

    fn selection_bounds_for_range(
        &mut self,
        range_utf16: Range<usize>,
        element_bounds: Bounds<Pixels>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Vec<Bounds<Pixels>> {
        self.bounds_for_range(range_utf16, element_bounds, window, cx)
            .into_iter()
            .collect()
    }

    fn character_index_for_point(
        &mut self,
        point: Point<Pixels>,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<usize> {
        let bounds = self.last_bounds?;
        let line = self.last_layout.as_ref()?;
        let utf8_index = line.closest_index_for_x(point.x - bounds.left());
        Some(self.offset_to_utf16(utf8_index))
    }

    fn set_selected_text_range(
        &mut self,
        range_utf16: Range<usize>,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.selected_range = self.range_from_utf16(&range_utf16);
        self.selection_reversed = false;
        cx.notify();
    }

    fn text_length_utf16(
        &mut self,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<usize> {
        Some(self.offset_to_utf16(self.content.len()))
    }

    fn accepts_text_input(&self, _window: &mut Window, _cx: &mut Context<Self>) -> bool {
        !self.disabled
    }
}

struct InputTextPrepaintState {
    line: Option<ShapedLine>,
    cursor: Option<PaintQuad>,
    selection: Option<PaintQuad>,
    hitbox: Hitbox,
}

struct InputTextElement {
    state: Entity<InputBoxState>,
}

impl Element for InputTextElement {
    type RequestLayoutState = ();
    type PrepaintState = InputTextPrepaintState;

    fn id(&self) -> Option<ElementId> {
        None
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
        style.size.height = window.line_height().into();
        (window.request_layout(style, [], cx), ())
    }

    fn prepaint(
        &mut self,
        _id: Option<&GlobalElementId>,
        _inspector_id: Option<&InspectorElementId>,
        bounds: Bounds<Pixels>,
        _request_layout: &mut Self::RequestLayoutState,
        window: &mut Window,
        cx: &mut App,
    ) -> Self::PrepaintState {
        let theme = ActiveTheme::current(cx);
        let input = self.state.read(cx);
        let content = input.content.clone();
        let placeholder = input.placeholder.clone();
        let selected_range = input.selected_range.clone();
        let marked_range = input.marked_range.clone();
        let cursor_offset = input.cursor_offset();
        let is_focused = input.focus_handle.is_focused(window);
        let disabled = input.disabled;

        let text_style = window.text_style();
        let font_size = text_style.font_size.to_pixels(window.rem_size());

        let (display_text, text_color) = if content.is_empty() {
            (placeholder, theme.input_placeholder_foreground())
        } else {
            (
                SharedString::from(content.clone()),
                theme.input_foreground(),
            )
        };

        let run = TextRun {
            len: display_text.len(),
            font: text_style.font(),
            color: text_color,
            background_color: None,
            underline: None,
            strikethrough: None,
        };

        let runs = if !content.is_empty()
            && let Some(marked) = marked_range
            && marked.start < marked.end
            && marked.end <= display_text.len()
        {
            let mut segments = Vec::with_capacity(3);
            if marked.start > 0 {
                segments.push(TextRun {
                    len: marked.start,
                    ..run.clone()
                });
            }
            segments.push(TextRun {
                len: marked.end - marked.start,
                underline: Some(UnderlineStyle {
                    color: Some(text_color),
                    thickness: px(1.0),
                    wavy: false,
                }),
                ..run.clone()
            });
            if marked.end < display_text.len() {
                segments.push(TextRun {
                    len: display_text.len() - marked.end,
                    ..run
                });
            }
            segments
        } else if !display_text.is_empty() {
            vec![run]
        } else {
            Vec::new()
        };

        let line = if display_text.is_empty() {
            None
        } else {
            Some(
                window
                    .text_system()
                    .shape_line(display_text, font_size, &runs, None),
            )
        };

        let cursor_pos = if content.is_empty() {
            px(0.0)
        } else {
            line.as_ref()
                .map(|shaped| shaped.x_for_index(cursor_offset))
                .unwrap_or_else(|| px(0.0))
        };

        let (selection, cursor) = if is_focused && !disabled {
            if selected_range.is_empty() {
                let caret_bounds = Bounds::new(
                    point(bounds.left() + cursor_pos, bounds.top() + px(2.0)),
                    size(px(1.5), (bounds.size.height - px(4.0)).max(px(12.0))),
                );
                (None, Some(fill(caret_bounds, theme.input_foreground())))
            } else if let Some(shaped) = line.as_ref() {
                let start_x = shaped.x_for_index(selected_range.start);
                let end_x = shaped.x_for_index(selected_range.end);
                let sel_bounds = Bounds::from_corners(
                    point(bounds.left() + start_x, bounds.top() + px(1.0)),
                    point(bounds.left() + end_x, bounds.bottom() - px(1.0)),
                );
                (Some(fill(sel_bounds, theme.selection_background())), None)
            } else {
                (None, None)
            }
        } else {
            (None, None)
        };

        let hitbox = window.insert_hitbox(bounds, HitboxBehavior::Normal);

        InputTextPrepaintState {
            line,
            cursor,
            selection,
            hitbox,
        }
    }

    fn paint(
        &mut self,
        _id: Option<&GlobalElementId>,
        _inspector_id: Option<&InspectorElementId>,
        bounds: Bounds<Pixels>,
        _request_layout: &mut Self::RequestLayoutState,
        prepaint: &mut Self::PrepaintState,
        window: &mut Window,
        cx: &mut App,
    ) {
        let (focus_handle, disabled) = {
            let input = self.state.read(cx);
            (input.focus_handle.clone(), input.disabled)
        };

        if !disabled {
            window.set_cursor_style(CursorStyle::IBeam, &prepaint.hitbox);
            window.handle_input(
                &focus_handle,
                ElementInputHandler::new(bounds, self.state.clone()),
                cx,
            );
        }

        if let Some(selection) = prepaint.selection.take() {
            window.paint_quad(selection);
        }

        let line = prepaint.line.take();
        if let Some(shaped) = line.as_ref() {
            let _ = shaped.paint(
                bounds.origin,
                window.line_height(),
                TextAlign::Left,
                None,
                window,
                cx,
            );
        }

        if let Some(cursor) = prepaint.cursor.take() {
            window.paint_quad(cursor);
        }

        self.state.update(cx, |input, _cx| {
            input.last_layout = line;
            input.last_bounds = Some(bounds);
        });
    }
}

impl Render for InputBoxState {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ActiveTheme::current(cx);
        let is_focused = self.focus_handle.is_focused(window);
        let border_color = if is_focused && !self.disabled {
            theme.focus_border()
        } else {
            theme.input_border()
        };
        let show_clear = self.allow_clear && !self.content.is_empty() && !self.disabled;
        let hover_bg = theme.toolbar_hover_background();

        let mut container = div()
            .key_context(INPUT_KEY_CONTEXT)
            .track_focus(&self.focus_handle)
            .flex()
            .items_center()
            .gap(rem_px(6.0))
            .w_full()
            .min_h(rem_px(26.0))
            .px(rem_px(6.0))
            .bg(theme.input_background())
            .text_color(theme.input_foreground())
            .text_size(rem_px(13.0))
            .line_height(rem_px(24.0))
            .border_1()
            .border_color(border_color)
            .rounded(rem_px(theme.metrics.corner_radius_small))
            .on_action(cx.listener(|this, _: &InputBackspace, _w, cx| this.backspace(cx)))
            .on_action(cx.listener(|this, _: &InputDelete, _w, cx| this.delete_forward(cx)))
            .on_action(cx.listener(|this, _: &InputLeft, _w, cx| this.move_left(false, cx)))
            .on_action(cx.listener(|this, _: &InputRight, _w, cx| this.move_right(false, cx)))
            .on_action(cx.listener(|this, _: &InputSelectLeft, _w, cx| this.move_left(true, cx)))
            .on_action(cx.listener(|this, _: &InputSelectRight, _w, cx| this.move_right(true, cx)))
            .on_action(cx.listener(|this, _: &InputSelectAll, _w, cx| this.select_all(cx)))
            .on_action(cx.listener(|this, _: &InputHome, _w, cx| this.move_home(false, cx)))
            .on_action(cx.listener(|this, _: &InputEnd, _w, cx| this.move_end(false, cx)))
            .on_action(cx.listener(Self::on_copy))
            .on_action(cx.listener(Self::on_cut))
            .on_action(cx.listener(Self::on_paste))
            .on_action(cx.listener(|this, _: &InputEnter, _w, cx| this.submit(cx)))
            .on_action(cx.listener(|this, _: &InputEscape, _w, cx| this.escape(cx)));

        if self.disabled {
            container = container.opacity(0.45);
        } else {
            container = container
                .on_mouse_down(MouseButton::Left, cx.listener(Self::on_mouse_down))
                .on_mouse_move(cx.listener(Self::on_mouse_move))
                .on_mouse_up(MouseButton::Left, cx.listener(Self::on_mouse_up))
                .on_mouse_up_out(MouseButton::Left, cx.listener(Self::on_mouse_up));
        }

        if let Some(icon_kind) = self.prefix_icon {
            container = container.child(
                codicon(icon_kind, 14.0, theme.input_placeholder_foreground()).size(rem_px(14.0)),
            );
        }

        container = container.child(
            div()
                .flex_1()
                .min_w_0()
                .overflow_hidden()
                .child(InputTextElement { state: cx.entity() }),
        );

        if show_clear {
            container = container.child(
                div()
                    .id("inputbox-clear")
                    .flex()
                    .items_center()
                    .justify_center()
                    .flex_shrink_0()
                    .size(rem_px(18.0))
                    .rounded(rem_px(theme.metrics.corner_radius_small))
                    .cursor_pointer()
                    .hover(move |style| style.bg(hover_bg))
                    .on_mouse_down(MouseButton::Left, |_event, _window, cx| {
                        cx.stop_propagation();
                    })
                    .on_click(cx.listener(|this, _event, window, cx| {
                        this.clear(cx);
                        this.focus_handle.focus(window, cx);
                    }))
                    .child(
                        codicon(Codicon::Close, 12.0, theme.icon_foreground()).size(rem_px(12.0)),
                    ),
            );
        }

        container
    }
}

#[derive(IntoElement)]
pub struct InputBox {
    state: Entity<InputBoxState>,
}

impl InputBox {
    pub fn new(state: Entity<InputBoxState>) -> Self {
        Self { state }
    }
}

impl RenderOnce for InputBox {
    fn render(self, _window: &mut Window, _cx: &mut App) -> impl IntoElement {
        self.state
    }
}
