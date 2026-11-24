use std::cell::Cell;
use std::rc::Rc;

use baseapp_platform::{SideBarPosition, ViewContainerLocation};
use baseapp_ui::{
    ActiveTheme, DialogModel, UI_FONT_FAMILY, render_context_menu_overlay, render_dialog_overlay,
    scaled_rem_size,
};
use gpui::{
    App, AppContext as _, Context, Entity, FocusHandle, Focusable, IntoElement, Render,
    Subscription, Window, div, prelude::*,
};

use crate::parts::editor::render_editor_part;
use crate::parts::notifications::{render_notifications_overlay, render_startup_overlay};
use crate::parts::overlay::OverlayState;
use crate::parts::sessions_view::SessionsView;
use crate::parts::settings::{OpenDialogHandler, SettingsEditorView};
use crate::parts::sidebar::{SidebarRenderContext, render_sidebar};
use crate::parts::statusbar::render_statusbar;
use crate::parts::titlebar::render_titlebar;
use crate::state::{
    CloseSettingsTab, CycleTheme, DismissOverlay, NewSession, OpenSettings, Relaunch, ResetLayout,
    ToggleAlwaysOnTop, ToggleAuxiliaryBar, ToggleCompactMode, ToggleFullScreen,
    ToggleSideBarPosition, ToggleSidebar, ToggleStatusBar, ToggleTertiaryBar, WorkbenchEvent,
    WorkbenchPage, WorkbenchState, ZoomIn, ZoomOut, ZoomReset,
};

fn wrap_dialog_with_dismiss(dialog: DialogModel, overlay: Entity<OverlayState>) -> DialogModel {
    match dialog {
        DialogModel::Confirm(mut model) => {
            let original_confirm = model.on_confirm;
            let overlay_confirm = overlay.clone();
            model.on_confirm = Rc::new(move |window, cx| {
                overlay_confirm.update(cx, |ov, cx| {
                    ov.dismiss_dialog(cx);
                });
                original_confirm(window, cx);
            });

            let original_cancel = model.on_cancel;
            let overlay_cancel = overlay;
            model.on_cancel = Rc::new(move |window, cx| {
                overlay_cancel.update(cx, |ov, cx| {
                    ov.dismiss_dialog(cx);
                });
                original_cancel(window, cx);
            });

            DialogModel::Confirm(model)
        }
        DialogModel::Prompt(mut model) => {
            let original_confirm = model.on_confirm;
            let overlay_confirm = overlay.clone();
            model.on_confirm = Rc::new(move |value, window, cx| {
                overlay_confirm.update(cx, |ov, cx| {
                    ov.dismiss_dialog(cx);
                });
                original_confirm(value, window, cx);
            });

            let original_cancel = model.on_cancel;
            let overlay_cancel = overlay;
            model.on_cancel = Rc::new(move |window, cx| {
                overlay_cancel.update(cx, |ov, cx| {
                    ov.dismiss_dialog(cx);
                });
                original_cancel(window, cx);
            });

            DialogModel::Prompt(model)
        }
    }
}

pub struct WorkbenchView {
    state: Entity<WorkbenchState>,
    focus_handle: FocusHandle,
    overlay: Entity<OverlayState>,
    sessions_view: Entity<SessionsView>,
    settings_view: Option<Entity<SettingsEditorView>>,
    primary_drag_start: Rc<Cell<f64>>,
    secondary_drag_start: Rc<Cell<f64>>,
    tertiary_drag_start: Rc<Cell<f64>>,
    _subscriptions: Vec<Subscription>,
}

impl WorkbenchView {
    pub fn new(state: Entity<WorkbenchState>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let focus_handle = cx.focus_handle();
        window.focus(&focus_handle, cx);

        let (initial_theme, initial_zoom, settings_open) = {
            let snapshot = state.read(cx);
            (
                snapshot.resolved_theme(),
                snapshot.config().zoom_level,
                snapshot.layout().settings_tab_open,
            )
        };
        ActiveTheme::set(cx, initial_theme);
        window.set_rem_size(scaled_rem_size(initial_zoom));

        let overlay = cx.new(|_| OverlayState::new());
        let sessions_view = cx.new(|cx| SessionsView::new(state.clone(), overlay.clone(), cx));

        let event_sub = cx.subscribe_in(
            &state,
            window,
            |_this, state_entity, event: &WorkbenchEvent, window, cx| match event {
                WorkbenchEvent::ThemeChanged(mode) => {
                    ActiveTheme::set(cx, *mode);
                    cx.notify();
                }
                WorkbenchEvent::ZoomChanged(level) => {
                    window.set_rem_size(scaled_rem_size(*level));
                    cx.notify();
                }
                WorkbenchEvent::ToggleFullScreenRequested => {
                    window.toggle_fullscreen();
                    let next_fullscreen = window.is_fullscreen();
                    state_entity.update(cx, |s, cx| s.set_fullscreen(next_fullscreen, cx));
                    cx.notify();
                }
                WorkbenchEvent::WindowEffectsChanged
                | WorkbenchEvent::TrayConfigChanged(_)
                | WorkbenchEvent::RelaunchRequested
                | WorkbenchEvent::QuitRequested => {}
            },
        );

        let state_observe_sub = cx.observe_in(&state, window, |this, _state, window, cx| {
            this.sync_settings_view(window, cx);
            cx.notify();
        });

        let overlay_observe_sub = cx.observe(&overlay, |_this, _overlay, cx| {
            cx.notify();
        });

        let mut view = Self {
            state,
            focus_handle,
            overlay,
            sessions_view,
            settings_view: None,
            primary_drag_start: Rc::new(Cell::new(0.0)),
            secondary_drag_start: Rc::new(Cell::new(0.0)),
            tertiary_drag_start: Rc::new(Cell::new(0.0)),
            _subscriptions: vec![event_sub, state_observe_sub, overlay_observe_sub],
        };

        if settings_open {
            view.sync_settings_view(window, cx);
        }

        view
    }

    pub fn state(&self) -> &Entity<WorkbenchState> {
        &self.state
    }

    pub fn overlay(&self) -> &Entity<OverlayState> {
        &self.overlay
    }

    pub fn sessions_view(&self) -> &Entity<SessionsView> {
        &self.sessions_view
    }

    pub fn settings_view(&self) -> Option<&Entity<SettingsEditorView>> {
        self.settings_view.as_ref()
    }

    fn open_dialog_handler(&self) -> OpenDialogHandler {
        let overlay = self.overlay.clone();
        Rc::new(
            move |dialog: DialogModel, _window: &mut Window, cx: &mut App| {
                let wrapped = wrap_dialog_with_dismiss(dialog, overlay.clone());
                overlay.update(cx, |ov, cx| ov.open_dialog(wrapped, cx));
            },
        )
    }

    fn sync_settings_view(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let should_exist = self.state.read(cx).layout().settings_tab_open;
        if should_exist {
            if self.settings_view.is_none() {
                let state = self.state.clone();
                let handler = self.open_dialog_handler();
                let created = cx.new(|cx| SettingsEditorView::new(state, handler, window, cx));
                self.settings_view = Some(created);
            }
        } else {
            self.settings_view = None;
        }
    }

    fn drag_start_cell(&self, location: ViewContainerLocation) -> Rc<Cell<f64>> {
        match location {
            ViewContainerLocation::Sidebar => self.primary_drag_start.clone(),
            ViewContainerLocation::AuxiliaryBar => self.secondary_drag_start.clone(),
            ViewContainerLocation::TertiaryBar => self.tertiary_drag_start.clone(),
        }
    }
}

impl Focusable for WorkbenchView {
    fn focus_handle(&self, _cx: &App) -> FocusHandle {
        self.focus_handle.clone()
    }
}

impl Render for WorkbenchView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.sync_settings_view(window, cx);

        let theme = ActiveTheme::current(cx);
        let side_bar_position = self.state.read(cx).layout().side_bar_position;
        let (left_location, right_location) = match side_bar_position {
            SideBarPosition::Left => (
                ViewContainerLocation::Sidebar,
                ViewContainerLocation::AuxiliaryBar,
            ),
            SideBarPosition::Right => (
                ViewContainerLocation::AuxiliaryBar,
                ViewContainerLocation::Sidebar,
            ),
        };

        let titlebar = render_titlebar(&self.state, &self.overlay, &theme, window, cx);
        let left_sidebar = render_sidebar(
            SidebarRenderContext {
                location: left_location,
                state: &self.state,
                overlay: &self.overlay,
                sessions_view: &self.sessions_view,
                drag_start_size: self.drag_start_cell(left_location),
                theme: &theme,
            },
            window,
            cx,
        );
        let right_sidebar = render_sidebar(
            SidebarRenderContext {
                location: right_location,
                state: &self.state,
                overlay: &self.overlay,
                sessions_view: &self.sessions_view,
                drag_start_size: self.drag_start_cell(right_location),
                theme: &theme,
            },
            window,
            cx,
        );
        let tertiary_bar = render_sidebar(
            SidebarRenderContext {
                location: ViewContainerLocation::TertiaryBar,
                state: &self.state,
                overlay: &self.overlay,
                sessions_view: &self.sessions_view,
                drag_start_size: self.drag_start_cell(ViewContainerLocation::TertiaryBar),
                theme: &theme,
            },
            window,
            cx,
        );
        let editor =
            render_editor_part(&self.state, self.settings_view.as_ref(), &theme, window, cx);
        let statusbar = render_statusbar(&self.state, &self.overlay, &theme, window, cx);

        let mut center_column = div()
            .id("workbench-center")
            .flex_1()
            .min_w_0()
            .min_h_0()
            .flex()
            .flex_col()
            .child(editor);

        if let Some(tertiary) = tertiary_bar {
            center_column = center_column.child(tertiary);
        }

        let mut body_row = div()
            .id("workbench-body")
            .flex_1()
            .min_h_0()
            .w_full()
            .flex();

        if let Some(left) = left_sidebar {
            body_row = body_row.child(left);
        }
        body_row = body_row.child(center_column);
        if let Some(right) = right_sidebar {
            body_row = body_row.child(right);
        }

        let notifications_overlay = render_notifications_overlay(&self.state, &theme, window, cx);
        let context_menu_overlay = {
            let menu_opt = self.overlay.read(cx).context_menu().cloned();
            menu_opt.map(|menu| {
                let overlay_dismiss = self.overlay.clone();
                let viewport_size = window.viewport_size();
                render_context_menu_overlay(&menu, viewport_size, &theme, move |_window, cx| {
                    overlay_dismiss.update(cx, |ov, cx| {
                        ov.dismiss_context_menu(cx);
                    });
                })
            })
        };
        let dialog_overlay = {
            let dialog_opt = self.overlay.read(cx).dialog().cloned();
            dialog_opt.map(|dialog| render_dialog_overlay(&dialog, &theme, window, cx))
        };
        let startup_overlay = render_startup_overlay(&self.state, &theme, window, cx);

        let mut root = div()
            .id("workbench-root")
            .key_context("Workbench")
            .track_focus(&self.focus_handle)
            .font_family(UI_FONT_FAMILY)
            .relative()
            .size_full()
            .flex()
            .flex_col()
            .overflow_hidden()
            .bg(theme.workbench_background())
            .text_color(theme.foreground())
            .on_action(cx.listener(|this, _: &ToggleAlwaysOnTop, _window, cx| {
                this.state.update(cx, |s, cx| {
                    s.toggle_always_on_top(cx);
                });
            }))
            .on_action(cx.listener(|this, _: &CycleTheme, _window, cx| {
                this.state.update(cx, |s, cx| {
                    s.cycle_theme(cx);
                });
            }))
            .on_action(cx.listener(|this, _: &ToggleSidebar, _window, cx| {
                this.state.update(cx, |s, cx| s.toggle_sidebar(cx));
            }))
            .on_action(cx.listener(|this, _: &ToggleAuxiliaryBar, _window, cx| {
                this.state.update(cx, |s, cx| s.toggle_auxiliary_bar(cx));
            }))
            .on_action(cx.listener(|this, _: &ToggleTertiaryBar, _window, cx| {
                this.state.update(cx, |s, cx| s.toggle_tertiary_bar(cx));
            }))
            .on_action(cx.listener(|this, _: &ToggleSideBarPosition, _window, cx| {
                this.state.update(cx, |s, cx| {
                    s.toggle_side_bar_position(cx);
                });
            }))
            .on_action(cx.listener(|this, _: &ToggleStatusBar, _window, cx| {
                this.state.update(cx, |s, cx| {
                    s.toggle_status_bar_visible(cx);
                });
            }))
            .on_action(cx.listener(|this, _: &ToggleCompactMode, _window, cx| {
                this.state.update(cx, |s, cx| s.toggle_compact_mode(cx));
            }))
            .on_action(cx.listener(|this, _: &ToggleFullScreen, _window, cx| {
                this.state
                    .update(cx, |s, cx| s.request_toggle_fullscreen(cx));
            }))
            .on_action(cx.listener(|this, _: &ZoomIn, _window, cx| {
                this.state.update(cx, |s, cx| {
                    s.zoom_in(cx);
                });
            }))
            .on_action(cx.listener(|this, _: &ZoomOut, _window, cx| {
                this.state.update(cx, |s, cx| {
                    s.zoom_out(cx);
                });
            }))
            .on_action(cx.listener(|this, _: &ZoomReset, _window, cx| {
                this.state.update(cx, |s, cx| {
                    s.zoom_reset(cx);
                });
            }))
            .on_action(cx.listener(|this, _: &ResetLayout, _window, cx| {
                this.state.update(cx, |s, cx| {
                    s.reset_layout(cx);
                });
            }))
            .on_action(cx.listener(|this, _: &OpenSettings, window, cx| {
                this.state.update(cx, |s, cx| s.open_settings(None, cx));
                this.sync_settings_view(window, cx);
                if let Some(settings) = &this.settings_view {
                    settings.update(cx, |view, cx| view.focus_search(window, cx));
                }
            }))
            .on_action(cx.listener(|this, _: &CloseSettingsTab, _window, cx| {
                this.state.update(cx, |s, cx| s.close_settings_tab(cx));
            }))
            .on_action(cx.listener(|this, _: &NewSession, _window, cx| {
                this.state.update(cx, |s, cx| {
                    s.set_page(WorkbenchPage::Home, cx);
                    s.create_session(None, cx);
                });
            }))
            .on_action(cx.listener(|this, _: &Relaunch, _window, cx| {
                this.state.update(cx, |s, cx| s.request_relaunch(cx));
            }))
            .on_action(cx.listener(|this, _: &DismissOverlay, _window, cx| {
                this.overlay.update(cx, |ov, cx| {
                    ov.dismiss_all(cx);
                });
            }))
            .child(titlebar)
            .child(body_row);

        if let Some(bar) = statusbar {
            root = root.child(bar);
        }
        if let Some(notifs) = notifications_overlay {
            root = root.child(notifs);
        }
        if let Some(menu) = context_menu_overlay {
            root = root.child(menu);
        }
        if let Some(dialog) = dialog_overlay {
            root = root.child(dialog);
        }
        if let Some(startup) = startup_overlay {
            root = root.child(startup);
        }

        root
    }
}
