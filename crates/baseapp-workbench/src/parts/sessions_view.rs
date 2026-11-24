use std::rc::Rc;

use baseapp_base::format_date;
use baseapp_platform::{MAX_SESSION_TITLE_LENGTH, SessionSummary};
use baseapp_ui::{
    ActionBarItem, ActiveTheme, Codicon, ConfirmDialogModel, ContextMenuEntry, ContextMenuModel,
    DialogModel, InputBox, InputBoxEvent, InputBoxState, PromptDialogModel, baseapp_tooltip,
    codicon, rem_px, validate_prompt_value,
};
use gpui::{
    App, AppContext as _, Context, Entity, IntoElement, MouseButton, Render, Subscription, Window,
    div, prelude::*, transparent_black,
};

use crate::parts::overlay::OverlayState;
use crate::state::{WorkbenchPage, WorkbenchState};

pub struct SessionsView {
    state: Entity<WorkbenchState>,
    overlay: Entity<OverlayState>,
    search_input: Entity<InputBoxState>,
    _subscriptions: Vec<Subscription>,
}

impl SessionsView {
    pub fn new(
        state: Entity<WorkbenchState>,
        overlay: Entity<OverlayState>,
        cx: &mut Context<Self>,
    ) -> Self {
        let initial_placeholder = state.read(cx).t("sessions.searchPlaceholder");
        let search_input = cx.new(|cx| {
            InputBoxState::new(cx)
                .with_prefix_icon(Codicon::Search)
                .with_allow_clear(true)
                .with_placeholder(initial_placeholder)
        });

        let search_sub = cx.subscribe(&search_input, |this, input, event: &InputBoxEvent, cx| {
            match event {
                InputBoxEvent::Changed(_) => {
                    cx.notify();
                }
                InputBoxEvent::Escape => {
                    if !input.read(cx).value().is_empty() {
                        input.update(cx, |state, cx| state.clear(cx));
                        cx.notify();
                    }
                }
                InputBoxEvent::Submit(_) => {}
            }
            let _ = this;
        });

        let state_sub = cx.observe(&state, |this, state, cx| {
            let placeholder = state.read(cx).t("sessions.searchPlaceholder");
            this.search_input.update(cx, |input, cx| {
                if input.placeholder().as_ref() != placeholder {
                    input.set_placeholder(placeholder, cx);
                }
            });
            cx.notify();
        });

        Self {
            state,
            overlay,
            search_input,
            _subscriptions: vec![search_sub, state_sub],
        }
    }

    pub fn header_actions(&self, cx: &App) -> Vec<ActionBarItem> {
        let snapshot = self.state.read(cx);
        let new_label = snapshot.t("sessions.newSession");
        let delete_all_label = snapshot.t("sessions.deleteAll");
        let delete_all_disabled =
            snapshot.sessions().is_empty() || snapshot.is_only_empty_session();

        let state_new = self.state.clone();
        let state_delete_all = self.state.clone();
        let overlay_delete_all = self.overlay.clone();
        let search_delete_all = self.search_input.clone();

        vec![
            ActionBarItem::new(
                "sessions-new",
                Codicon::Add,
                new_label,
                move |_e, _w, cx| {
                    state_new.update(cx, |s, cx| {
                        s.set_page(WorkbenchPage::Home, cx);
                        s.create_session(None, cx);
                    });
                },
            ),
            ActionBarItem::new(
                "sessions-delete-all",
                Codicon::ClearAll,
                delete_all_label,
                move |_e, _w, cx| {
                    open_delete_all_dialog(
                        &state_delete_all,
                        &overlay_delete_all,
                        &search_delete_all,
                        cx,
                    );
                },
            )
            .danger(true)
            .disabled(delete_all_disabled),
        ]
    }
}

fn display_session_title(state: &WorkbenchState, session: &SessionSummary) -> String {
    if session.is_default_title {
        state.t("sessions.newSession")
    } else {
        session.title.clone()
    }
}

fn open_delete_all_dialog(
    state: &Entity<WorkbenchState>,
    overlay: &Entity<OverlayState>,
    search_input: &Entity<InputBoxState>,
    cx: &mut App,
) {
    let snapshot = state.read(cx);
    if snapshot.sessions().is_empty() || snapshot.is_only_empty_session() {
        return;
    }
    let title = snapshot.t("sessions.deleteAllConfirmTitle");
    let detail = snapshot.t("sessions.deleteAllConfirmDescription");
    let confirm_label = snapshot.t("common.delete");
    let cancel_label = snapshot.t("common.cancel");

    let state_confirm = state.clone();
    let overlay_confirm = overlay.clone();
    let search_confirm = search_input.clone();
    let overlay_cancel = overlay.clone();

    let model = DialogModel::Confirm(ConfirmDialogModel {
        title: title.into(),
        detail: Some(detail.into()),
        confirm_label: confirm_label.into(),
        cancel_label: cancel_label.into(),
        danger: true,
        on_confirm: Rc::new(move |_window, cx| {
            overlay_confirm.update(cx, |ov, cx| {
                ov.dismiss_dialog(cx);
            });
            state_confirm.update(cx, |s, cx| {
                if s.delete_all_sessions(cx) {
                    search_confirm.update(cx, |input, cx| input.clear(cx));
                }
            });
        }),
        on_cancel: Rc::new(move |_window, cx| {
            overlay_cancel.update(cx, |ov, cx| {
                ov.dismiss_dialog(cx);
            });
        }),
    });

    overlay.update(cx, |ov, cx| ov.open_dialog(model, cx));
}

fn open_rename_dialog(
    state: &Entity<WorkbenchState>,
    overlay: &Entity<OverlayState>,
    session: &SessionSummary,
    window: &mut Window,
    cx: &mut App,
) {
    let snapshot = state.read(cx);
    let title = snapshot.t("sessions.renameSession");
    let initial_value = display_session_title(snapshot, session);
    let confirm_label = snapshot.t("common.save");
    let cancel_label = snapshot.t("common.cancel");

    let input = cx.new(|cx| {
        InputBoxState::new(cx)
            .with_max_length(MAX_SESSION_TITLE_LENGTH)
            .with_value(initial_value)
    });
    input.update(cx, |input_state, cx| {
        input_state.focus(window, cx);
        input_state.select_all(cx);
    });

    let session_id = session.id.clone();
    let state_confirm = state.clone();
    let overlay_confirm = overlay.clone();
    let overlay_cancel = overlay.clone();

    let state_submit = state.clone();
    let overlay_submit = overlay.clone();
    let session_id_submit = session.id.clone();
    let input_sub = cx.subscribe(
        &input,
        move |_entity, event: &InputBoxEvent, cx| match event {
            InputBoxEvent::Submit(raw) => {
                if let Some(clean) = validate_prompt_value(raw, MAX_SESSION_TITLE_LENGTH) {
                    overlay_submit.update(cx, |ov, cx| {
                        ov.dismiss_dialog(cx);
                    });
                    state_submit.update(cx, |s, cx| {
                        s.rename_session(&session_id_submit, &clean, cx);
                    });
                }
            }
            InputBoxEvent::Escape => {
                overlay_submit.update(cx, |ov, cx| {
                    ov.dismiss_dialog(cx);
                });
            }
            InputBoxEvent::Changed(_) => {}
        },
    );

    let model = DialogModel::Prompt(PromptDialogModel {
        title: title.into(),
        detail: None,
        confirm_label: confirm_label.into(),
        cancel_label: cancel_label.into(),
        max_length: MAX_SESSION_TITLE_LENGTH,
        input,
        on_confirm: Rc::new(move |value, _window, cx| {
            overlay_confirm.update(cx, |ov, cx| {
                ov.dismiss_dialog(cx);
            });
            state_confirm.update(cx, |s, cx| {
                s.rename_session(&session_id, &value, cx);
            });
        }),
        on_cancel: Rc::new(move |_window, cx| {
            overlay_cancel.update(cx, |ov, cx| {
                ov.dismiss_dialog(cx);
            });
        }),
    });

    overlay.update(cx, |ov, cx| {
        ov.open_dialog_with_subscription(model, Some(input_sub), cx);
    });
}

impl Render for SessionsView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ActiveTheme::current(cx);
        let snapshot = self.state.read(cx);
        let sessions: Vec<SessionSummary> = snapshot.sessions().to_vec();
        let current_session_id = snapshot.current_session().map(|s| s.id.clone());
        let deletable = !snapshot.is_only_empty_session();
        let locale = snapshot.locale();
        let date_format = snapshot.config().date_format;
        let time_format = snapshot.config().time_format;

        let empty_title = snapshot.t("sessions.emptyTitle");
        let no_results = snapshot.t("sessions.noSearchResults");
        let pinned_label = snapshot.t("sessions.pinned");
        let pin_label = snapshot.t("sessions.pin");
        let unpin_label = snapshot.t("sessions.unpin");
        let rename_label = snapshot.t("common.rename");
        let delete_label = snapshot.t("common.delete");

        let query = self.search_input.read(cx).value().trim().to_lowercase();

        let mut root = div()
            .id("sessions-view")
            .flex()
            .flex_col()
            .size_full()
            .min_h_0()
            .min_w_0();

        if !sessions.is_empty() {
            root = root.child(
                div()
                    .px(rem_px(8.0))
                    .pt(rem_px(8.0))
                    .pb(rem_px(6.0))
                    .flex_shrink_0()
                    .child(InputBox::new(self.search_input.clone())),
            );
        }

        if sessions.is_empty() {
            return root.child(
                div()
                    .flex_1()
                    .flex()
                    .flex_col()
                    .items_center()
                    .justify_center()
                    .gap(rem_px(8.0))
                    .p(rem_px(16.0))
                    .text_color(theme.description_foreground())
                    .child(
                        codicon(Codicon::Files, 24.0, theme.description_foreground())
                            .size(rem_px(24.0)),
                    )
                    .child(
                        div()
                            .text_size(rem_px(12.0))
                            .line_height(rem_px(17.0))
                            .child(empty_title),
                    ),
            );
        }

        let filtered: Vec<(SessionSummary, String)> = sessions
            .into_iter()
            .filter_map(|session| {
                let title = display_session_title(snapshot, &session);
                if query.is_empty() || title.to_lowercase().contains(&query) {
                    Some((session, title))
                } else {
                    None
                }
            })
            .collect();

        if filtered.is_empty() {
            return root.child(
                div()
                    .flex_1()
                    .flex()
                    .flex_col()
                    .items_center()
                    .justify_center()
                    .gap(rem_px(8.0))
                    .p(rem_px(16.0))
                    .text_color(theme.description_foreground())
                    .child(
                        codicon(Codicon::Search, 24.0, theme.description_foreground())
                            .size(rem_px(24.0)),
                    )
                    .child(
                        div()
                            .text_size(rem_px(12.0))
                            .line_height(rem_px(17.0))
                            .child(no_results),
                    ),
            );
        }

        let mut list = div()
            .id("sessions-list-scroll")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .flex()
            .flex_col()
            .gap(rem_px(2.0))
            .px(rem_px(6.0))
            .pb(rem_px(8.0));

        let active_bg = theme.list_active_selection_background();
        let active_fg = theme.list_active_selection_foreground();
        let hover_bg = theme.list_hover_background();
        let normal_fg = theme.side_bar_foreground();
        let desc_fg = theme.description_foreground();
        let accent_fg = theme.session_accent();

        for (index, (session, title_text)) in filtered.into_iter().enumerate() {
            let active = current_session_id.as_deref() == Some(session.id.as_str());
            let timestamp = format_date(
                &session.updated_at,
                time_format,
                date_format,
                locale.as_str(),
            );
            let row_fg = if active { active_fg } else { normal_fg };
            let meta_fg = if active { active_fg } else { desc_fg };

            let mut title_row = div()
                .flex()
                .items_center()
                .gap(rem_px(4.0))
                .min_w_0()
                .w_full();

            if session.pinned {
                let pin_fg = if active { active_fg } else { accent_fg };
                title_row = title_row.child(
                    div()
                        .id(("session-pin-badge", index))
                        .flex_shrink_0()
                        .tooltip(baseapp_tooltip(pinned_label.clone()))
                        .child(codicon(Codicon::Pinned, 11.0, pin_fg).size(rem_px(11.0))),
                );
            }

            title_row = title_row.child(
                div()
                    .flex_1()
                    .min_w_0()
                    .overflow_hidden()
                    .whitespace_nowrap()
                    .text_ellipsis()
                    .text_size(rem_px(13.0))
                    .line_height(rem_px(18.0))
                    .text_color(row_fg)
                    .child(title_text),
            );

            let body = div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .gap(rem_px(1.0))
                .child(title_row)
                .child(
                    div()
                        .min_w_0()
                        .overflow_hidden()
                        .whitespace_nowrap()
                        .text_ellipsis()
                        .text_size(rem_px(11.0))
                        .line_height(rem_px(15.0))
                        .text_color(meta_fg)
                        .opacity(if active { 0.85 } else { 1.0 })
                        .child(timestamp),
                );

            let state_open = self.state.clone();
            let overlay_rename = self.overlay.clone();
            let session_for_click = session.clone();
            let open_area = div()
                .id(("session-open", index))
                .flex_1()
                .min_w_0()
                .flex()
                .items_center()
                .gap(rem_px(8.0))
                .cursor_pointer()
                .on_click(move |event, window, cx| {
                    if event.click_count() >= 2 {
                        open_rename_dialog(
                            &state_open,
                            &overlay_rename,
                            &session_for_click,
                            window,
                            cx,
                        );
                    } else {
                        let id = session_for_click.id.clone();
                        state_open.update(cx, |s, cx| {
                            s.set_page(WorkbenchPage::Home, cx);
                            s.open_session(&id, cx);
                        });
                    }
                })
                .child(
                    div()
                        .flex_shrink_0()
                        .child(codicon(Codicon::Files, 14.0, row_fg).size(rem_px(14.0))),
                )
                .child(body);

            let state_delete = self.state.clone();
            let delete_id = session.id.clone();
            let delete_fg = if active {
                active_fg
            } else {
                theme.icon_foreground()
            };
            let delete_hover_bg = theme.toolbar_hover_background();
            let mut delete_btn = div()
                .id(("session-delete", index))
                .flex()
                .items_center()
                .justify_center()
                .flex_shrink_0()
                .size(rem_px(22.0))
                .rounded(rem_px(theme.metrics.corner_radius_medium))
                .bg(transparent_black())
                .on_mouse_down(MouseButton::Left, |_event, _window, cx| {
                    cx.stop_propagation();
                })
                .child(codicon(Codicon::Trash, 14.0, delete_fg).size(rem_px(14.0)));
            if deletable {
                delete_btn = delete_btn
                    .cursor_pointer()
                    .hover(move |style| style.bg(delete_hover_bg))
                    .tooltip(baseapp_tooltip(delete_label.clone()))
                    .on_click(move |_event, _window, cx| {
                        cx.stop_propagation();
                        state_delete.update(cx, |s, cx| {
                            s.delete_session(&delete_id, cx);
                        });
                    });
            } else {
                delete_btn = delete_btn.opacity(0.45);
            }

            let state_ctx = self.state.clone();
            let overlay_ctx = self.overlay.clone();
            let session_ctx = session.clone();
            let ctx_pin_label = if session.pinned {
                unpin_label.clone()
            } else {
                pin_label.clone()
            };
            let ctx_rename_label = rename_label.clone();
            let ctx_delete_label = delete_label.clone();

            let mut row = div()
                .id(("session-row", index))
                .flex()
                .items_center()
                .gap(rem_px(4.0))
                .w_full()
                .px(rem_px(8.0))
                .py(rem_px(5.0))
                .rounded(rem_px(theme.metrics.corner_radius_medium))
                .bg(if active {
                    active_bg
                } else {
                    transparent_black()
                })
                .on_mouse_down(MouseButton::Right, move |event, _window, cx| {
                    cx.stop_propagation();
                    let state_pin = state_ctx.clone();
                    let session_pin_id = session_ctx.id.clone();
                    let next_pinned = !session_ctx.pinned;

                    let state_ren = state_ctx.clone();
                    let overlay_ren = overlay_ctx.clone();
                    let session_ren = session_ctx.clone();

                    let state_del = state_ctx.clone();
                    let session_del_id = session_ctx.id.clone();

                    let menu = ContextMenuModel::new(
                        event.position,
                        vec![
                            ContextMenuEntry::action(
                                "session-ctx-pin",
                                ctx_pin_label.clone(),
                                move |_w, cx| {
                                    state_pin.update(cx, |s, cx| {
                                        s.toggle_session_pinned(&session_pin_id, next_pinned, cx);
                                    });
                                },
                            )
                            .with_icon(if session_ctx.pinned {
                                Codicon::Pinned
                            } else {
                                Codicon::Pin
                            }),
                            ContextMenuEntry::action(
                                "session-ctx-rename",
                                ctx_rename_label.clone(),
                                move |window, cx| {
                                    open_rename_dialog(
                                        &state_ren,
                                        &overlay_ren,
                                        &session_ren,
                                        window,
                                        cx,
                                    );
                                },
                            )
                            .with_icon(Codicon::Edit),
                            ContextMenuEntry::separator(),
                            ContextMenuEntry::action(
                                "session-ctx-delete",
                                ctx_delete_label.clone(),
                                move |_w, cx| {
                                    state_del.update(cx, |s, cx| {
                                        s.delete_session(&session_del_id, cx);
                                    });
                                },
                            )
                            .with_icon(Codicon::Trash)
                            .with_danger(true)
                            .with_disabled(!deletable),
                        ],
                    );
                    overlay_ctx.update(cx, |ov, cx| ov.open_context_menu(menu, cx));
                })
                .child(open_area)
                .child(delete_btn);

            if !active {
                row = row.hover(move |style| style.bg(hover_bg));
            }

            list = list.child(row);
        }

        root.child(list)
    }
}
