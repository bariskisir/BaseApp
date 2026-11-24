use std::cell::RefCell;
use std::rc::Rc;

use baseapp_base::Color;
use baseapp_platform::ResolvedThemeMode;
use baseapp_ui::{
    ActionBar, ActionBarItem, ActiveTheme, BaseAppTooltip, Button, ButtonVariant, Checkbox,
    Codicon, ConfirmDialogModel, ContextMenuEntry, ContextMenuModel, DialogModel, InputBox,
    InputBoxEvent, InputBoxState, MONO_FONT_FAMILY, ProgressBar, PromptDialogModel, Sash,
    SashOrientation, SegmentedControl, SegmentedOption, SelectBox, SelectBoxState, SelectOption,
    SelectTrigger, Slider, UI_FONT_FAMILY, clamp_context_menu_position, color_to_hsla,
    color_to_rgba, register_input_keybindings, rem_px, render_context_menu_overlay,
    render_dialog_overlay, scaled_rem_size, select_options_to_menu_entries, select_trigger,
    slider_value_for_ratio, validate_prompt_value,
};
use gpui::{
    AppContext, Context, Entity, EntityInputHandler, Render, TestAppContext, Window, div, point,
    prelude::*, px, size,
};

#[test]
fn theme_color_and_scaling_helpers_match_baseapp_tokens() {
    assert!(!UI_FONT_FAMILY.is_empty());
    assert!(!MONO_FONT_FAMILY.is_empty());

    let accent = Color::from_rgb(0, 120, 212);
    let rgba = color_to_rgba(accent);
    assert!((rgba.r - 0.0).abs() < 1e-6);
    assert!((rgba.g - 120.0 / 255.0).abs() < 1e-5);
    assert!((rgba.b - 212.0 / 255.0).abs() < 1e-5);
    assert!((rgba.a - 1.0).abs() < 1e-6);

    let hsla = color_to_hsla(accent);
    assert!((hsla.a - 1.0).abs() < 1e-6);

    let dark = ActiveTheme::for_mode(ResolvedThemeMode::Dark);
    let light = ActiveTheme::for_mode(ResolvedThemeMode::Light);
    assert_eq!(dark.mode, ResolvedThemeMode::Dark);
    assert_eq!(light.mode, ResolvedThemeMode::Light);
    assert_eq!(dark.palette.workbench_background.format_hex(), "#1f1f1f");
    assert_eq!(
        dark.palette.title_bar_active_background.format_hex(),
        "#181818"
    );
    assert_eq!(dark.palette.accent_primary.format_hex(), "#0078d4");
    assert_eq!(light.palette.workbench_background.format_hex(), "#ffffff");
    assert_eq!(
        light.palette.title_bar_active_background.format_hex(),
        "#f8f8f8"
    );
    assert_eq!(light.palette.accent_primary.format_hex(), "#005fb8");
    assert!(dark.color("accent.primary").is_some());
    assert!(dark.color("does.not.exist").is_none());

    assert_eq!(rem_px(16.0), gpui::rems(1.0));
    assert_eq!(rem_px(32.0), gpui::rems(2.0));
    assert!((f32::from(scaled_rem_size(0.0)) - 16.0).abs() < 1e-4);
    assert!((f32::from(scaled_rem_size(1.0)) - 19.2).abs() < 1e-3);
    assert!((f32::from(scaled_rem_size(-1.0)) - (16.0 / 1.2)).abs() < 1e-3);
}

#[test]
fn pure_widget_math_and_validation_helpers() {
    assert_eq!(slider_value_for_ratio(0.0, 0.4, 1.0, 0.05), 0.4);
    assert_eq!(slider_value_for_ratio(1.0, 0.4, 1.0, 0.05), 1.0);
    assert_eq!(slider_value_for_ratio(0.5, 0.4, 1.0, 0.05), 0.7);
    assert_eq!(slider_value_for_ratio(-0.5, 0.4, 1.0, 0.05), 0.4);
    assert_eq!(slider_value_for_ratio(1.5, 0.4, 1.0, 0.05), 1.0);

    let clamped = clamp_context_menu_position(
        point(px(950.0), px(700.0)),
        px(200.0),
        px(160.0),
        size(px(1000.0), px(720.0)),
    );
    assert_eq!(clamped.x, px(796.0));
    assert_eq!(clamped.y, px(556.0));

    let clamped_min = clamp_context_menu_position(
        point(px(-20.0), px(-10.0)),
        px(200.0),
        px(160.0),
        size(px(1000.0), px(720.0)),
    );
    assert_eq!(clamped_min.x, px(4.0));
    assert_eq!(clamped_min.y, px(4.0));

    assert_eq!(validate_prompt_value("   ", 20), None);
    assert_eq!(
        validate_prompt_value("  Merhaba Dünya  ", 20),
        Some(String::from("Merhaba Dünya"))
    );
    assert_eq!(
        validate_prompt_value("ığşçöü", 6),
        Some(String::from("ığşçöü"))
    );
    assert_eq!(validate_prompt_value("ığşçöü!", 6), None);

    let opts = vec![
        SelectOption::new("en", "English"),
        SelectOption::new("tr", "Türkçe"),
    ];
    let entries = select_options_to_menu_entries(&opts, &"tr", |_, _, _| {});
    assert_eq!(entries.len(), 2);
    assert!(matches!(
        entries[0],
        ContextMenuEntry::Action { checked: false, .. }
    ));
    assert!(matches!(
        entries[1],
        ContextMenuEntry::Action { checked: true, .. }
    ));
}

#[gpui::test]
fn active_theme_global_switches_between_dark_and_light(cx: &mut TestAppContext) {
    cx.update(|cx| {
        assert_eq!(ActiveTheme::current(cx).mode, ResolvedThemeMode::Dark);
        ActiveTheme::set(cx, ResolvedThemeMode::Light);
        assert_eq!(ActiveTheme::current(cx).mode, ResolvedThemeMode::Light);
        ActiveTheme::set(cx, ResolvedThemeMode::Dark);
        assert_eq!(ActiveTheme::current(cx).mode, ResolvedThemeMode::Dark);
    });
}

#[gpui::test]
fn input_box_handles_unicode_turkish_emoji_selection_and_events(cx: &mut TestAppContext) {
    cx.update(register_input_keybindings);

    let events: Rc<RefCell<Vec<InputBoxEvent>>> = Rc::new(RefCell::new(Vec::new()));
    let input = cx.new(|cx| {
        InputBoxState::new(cx)
            .with_placeholder("Ara...")
            .with_prefix_icon(Codicon::Search)
            .with_allow_clear(true)
    });

    let events_sub = events.clone();
    let _sub = cx.update(|cx| {
        cx.subscribe(&input, move |_entity, event: &InputBoxEvent, _cx| {
            events_sub.borrow_mut().push(event.clone());
        })
    });

    input.update(cx, |state, cx| {
        state.insert_text("Merhaba ıİğĞşŞçÇöÖüÜ 🚀 日本語\nignored", cx);
        assert_eq!(state.value(), "Merhaba ıİğĞşŞçÇöÖüÜ 🚀 日本語ignored");

        let utf16_len = state.offset_to_utf16(state.value().len());
        assert_eq!(state.offset_from_utf16(utf16_len), state.value().len());

        let emoji_start = state.value().find('🚀').expect("emoji present");
        let emoji_utf16 = state.offset_to_utf16(emoji_start);
        assert_eq!(state.offset_from_utf16(emoji_utf16), emoji_start);
        assert_eq!(
            state.offset_from_utf16(emoji_utf16 + 2),
            emoji_start + '🚀'.len_utf8()
        );
    });

    input.update(cx, |state, cx| {
        state.set_value("ığş🚀", cx);
        assert_eq!(state.value(), "ığş🚀");
        state.backspace(cx);
        assert_eq!(state.value(), "ığş");
        state.move_home(false, cx);
        state.delete_forward(cx);
        assert_eq!(state.value(), "ğş");
        state.move_right(true, cx);
        state.insert_text("Ç", cx);
        assert_eq!(state.value(), "Çş");
        state.select_all(cx);
        state.insert_text("Yeni", cx);
        assert_eq!(state.value(), "Yeni");
        state.submit(cx);
        state.escape(cx);
        state.clear(cx);
        assert_eq!(state.value(), "");
    });

    let recorded = events.borrow();
    assert!(recorded.contains(&InputBoxEvent::Submit(String::from("Yeni"))));
    assert!(recorded.contains(&InputBoxEvent::Escape));
    assert_eq!(
        recorded.last(),
        Some(&InputBoxEvent::Changed(String::new()))
    );
}

#[gpui::test]
fn input_box_entity_input_handler_round_trips_utf16_and_ime(cx: &mut TestAppContext) {
    let input = cx.new(|cx| InputBoxState::new(cx).with_value("A🚀B").with_max_length(8));
    let (view, _visual_cx) = cx.add_window_view(|_window, _cx| {
        struct Host {
            input: Entity<InputBoxState>,
        }
        impl Render for Host {
            fn render(
                &mut self,
                _window: &mut Window,
                _cx: &mut Context<Self>,
            ) -> impl IntoElement {
                div().child(InputBox::new(self.input.clone()))
            }
        }
        Host {
            input: input.clone(),
        }
    });

    let _ = cx.update_window(cx.windows()[0], |_root, window, cx| {
        input.update(cx, |state, cx| {
            assert_eq!(state.text_length_utf16(window, cx), Some(4));
            let mut adjusted = None;
            let text = state.text_for_range(1..3, &mut adjusted, window, cx);
            assert_eq!(text.as_deref(), Some("🚀"));
            assert_eq!(adjusted, Some(1..3));

            state.replace_and_mark_text_in_range(Some(1..3), "İğ", Some(0..2), window, cx);
            assert_eq!(state.value(), "AİğB");
            assert_eq!(state.marked_text_range(window, cx), Some(1..3));

            state.replace_text_in_range(None, "Ş", window, cx);
            assert_eq!(state.value(), "AŞB");
            assert_eq!(state.marked_text_range(window, cx), None);

            let sel = state
                .selected_text_range(false, window, cx)
                .expect("selection present");
            assert_eq!(sel.range, 2..2);
            assert!(!sel.reversed);
        });
    });

    drop(view);
}

struct WidgetShowcaseView {
    input: Entity<InputBoxState>,
    prompt_input: Entity<InputBoxState>,
    select_box: Entity<SelectBoxState<String>>,
    tooltip: Entity<BaseAppTooltip>,
    show_confirm_dialog: bool,
}

impl Render for WidgetShowcaseView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ActiveTheme::current(cx);
        let menu = ContextMenuModel::new(
            point(px(40.0), px(40.0)),
            vec![
                ContextMenuEntry::action("menu-open", "Open", |_w, _cx| {})
                    .with_icon(Codicon::FolderOpened),
                ContextMenuEntry::action("menu-pin", "Pinned", |_w, _cx| {}).with_checked(true),
                ContextMenuEntry::separator(),
                ContextMenuEntry::action("menu-delete", "Delete", |_w, _cx| {})
                    .with_icon(Codicon::Trash)
                    .with_danger(true),
                ContextMenuEntry::action("menu-disabled", "Disabled", |_w, _cx| {})
                    .with_disabled(true),
            ],
        );

        let dialog = if self.show_confirm_dialog {
            DialogModel::Confirm(ConfirmDialogModel {
                title: "Delete Session".into(),
                detail: Some("This action cannot be undone.".into()),
                confirm_label: "Delete".into(),
                cancel_label: "Cancel".into(),
                danger: true,
                on_confirm: Rc::new(|_w, _cx| {}),
                on_cancel: Rc::new(|_w, _cx| {}),
            })
        } else {
            DialogModel::Prompt(PromptDialogModel {
                title: "Rename Session".into(),
                detail: Some("Enter a new session name.".into()),
                confirm_label: "Rename".into(),
                cancel_label: "Cancel".into(),
                max_length: 80,
                input: self.prompt_input.clone(),
                on_confirm: Rc::new(|_value, _w, _cx| {}),
                on_cancel: Rc::new(|_w, _cx| {}),
            })
        };

        div()
            .relative()
            .flex()
            .flex_col()
            .gap(rem_px(8.0))
            .size_full()
            .bg(theme.workbench_background())
            .child(
                div()
                    .flex()
                    .gap(rem_px(6.0))
                    .child(
                        Button::new("btn-primary")
                            .variant(ButtonVariant::Primary)
                            .label("Primary")
                            .icon(Codicon::Add)
                            .tooltip("Add item")
                            .on_click(|_e, _w, _cx| {}),
                    )
                    .child(
                        Button::new("btn-secondary")
                            .secondary()
                            .label("Secondary")
                            .small(true),
                    )
                    .child(Button::new("btn-danger").danger().label("Danger"))
                    .child(
                        Button::new("btn-icon")
                            .icon_variant()
                            .icon(Codicon::SettingsGear)
                            .active(true),
                    )
                    .child(
                        Button::new("btn-ghost")
                            .ghost()
                            .label("Loading")
                            .loading(true),
                    )
                    .child(Button::new("btn-disabled").label("Disabled").disabled(true)),
            )
            .child(InputBox::new(self.input.clone()))
            .child(
                Checkbox::new("chk-main")
                    .checked(true)
                    .label("Enable feature")
                    .tooltip("Toggle option")
                    .on_change(|_checked, _w, _cx| {}),
            )
            .child(
                SegmentedControl::new(
                    "seg-theme",
                    vec![
                        SegmentedOption::new("system", "System").icon(Codicon::DeviceDesktop),
                        SegmentedOption::new("light", "Light").icon(Codicon::Sun),
                        SegmentedOption::new("dark", "Dark").icon(Codicon::Moon),
                    ],
                    "dark",
                )
                .on_change(|_val, _w, _cx| {}),
            )
            .child(SelectBox::new(self.select_box.clone()))
            .child(SelectTrigger::new("sel-stateless", "English").min_width(160.0))
            .child(select_trigger(
                "sel-helper",
                "Türkçe",
                false,
                false,
                |_e, _w, _cx| {},
            ))
            .child(
                Slider::new("slider-opacity", 0.4, 1.0, 0.05, 0.85)
                    .value_label("85%")
                    .on_change(|_val, _w, _cx| {}),
            )
            .child(
                div()
                    .flex()
                    .h(rem_px(24.0))
                    .child(
                        Sash::new("sash-v", SashOrientation::Vertical)
                            .on_drag_start(|_w, _cx| {})
                            .on_drag_move(|_delta, _w, _cx| {})
                            .on_drag_end(|_w, _cx| {}),
                    )
                    .child(Sash::horizontal("sash-h").on_drag_move(|_delta, _w, _cx| {})),
            )
            .child(ActionBar::new(vec![
                ActionBarItem::new("act-add", Codicon::Add, "New", |_e, _w, _cx| {}),
                ActionBarItem::new("act-del", Codicon::Trash, "Delete", |_e, _w, _cx| {})
                    .danger(true),
                ActionBarItem::new("act-off", Codicon::Refresh, "Reload", |_e, _w, _cx| {})
                    .disabled(true),
            ]))
            .child(ProgressBar::determinate(65.0))
            .child(ProgressBar::indeterminate())
            .child(self.tooltip.clone())
            .child(render_context_menu_overlay(
                &menu,
                window.viewport_size(),
                &theme,
                |_w, _cx| {},
            ))
            .child(render_dialog_overlay(&dialog, &theme, window, cx))
    }
}

#[gpui::test]
fn renders_all_widgets_and_overlays_in_dark_and_light_themes(cx: &mut TestAppContext) {
    cx.update(|cx| {
        register_input_keybindings(cx);
        ActiveTheme::set(cx, ResolvedThemeMode::Dark);
    });

    let input = cx.new(|cx| {
        InputBoxState::new(cx)
            .with_placeholder("Search settings")
            .with_prefix_icon(Codicon::Search)
            .with_allow_clear(true)
            .with_value("theme")
    });
    let prompt_input = cx.new(|cx| InputBoxState::new(cx).with_value("Session 1"));
    let select_box = cx.new(|cx| {
        SelectBoxState::new(
            vec![
                SelectOption::new(String::from("en"), "English"),
                SelectOption::new(String::from("tr"), "Türkçe"),
            ],
            String::from("en"),
            cx,
        )
    });
    let tooltip = cx.new(|_| BaseAppTooltip::new("Tooltip preview"));

    let (view, visual_cx) = cx.add_window_view(|_window, _cx| WidgetShowcaseView {
        input: input.clone(),
        prompt_input: prompt_input.clone(),
        select_box: select_box.clone(),
        tooltip: tooltip.clone(),
        show_confirm_dialog: true,
    });
    visual_cx.run_until_parked();

    visual_cx.update(|window, cx| {
        select_box.update(cx, |state, cx| state.toggle(window, cx));
        ActiveTheme::set(cx, ResolvedThemeMode::Light);
        view.update(cx, |showcase, cx| {
            showcase.show_confirm_dialog = false;
            cx.notify();
        });
    });
    visual_cx.run_until_parked();
    assert!(select_box.read_with(cx, |s, _| s.is_open()));

    let _ = cx.refresh();
}
