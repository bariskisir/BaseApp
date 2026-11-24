use baseapp_base::DesktopPlatform;
use baseapp_platform::{
    AppConfigurationPatch, SideBarPosition, ThemeMode, clamp_window_opacity, snap_window_opacity,
};
use baseapp_ui::{
    ActiveTheme, Codicon, ContextMenuEntry, ContextMenuModel, Slider, baseapp_tooltip, brand_logo,
    codicon, rem_px,
};
use gpui::{
    AnyElement, App, ClickEvent, Entity, MouseButton, Pixels, Point, SharedString, Window,
    WindowControlArea, div, point, prelude::*, px, rgb, transparent_black,
};

use crate::parts::overlay::OverlayState;
use crate::state::{WorkbenchPage, WorkbenchState};

fn theme_icon(theme: ThemeMode) -> Codicon {
    match theme {
        ThemeMode::Light => Codicon::Sun,
        ThemeMode::Dark => Codicon::Moon,
        ThemeMode::System => Codicon::DeviceDesktop,
    }
}

fn titlebar_icon_button(
    id: &'static str,
    icon: Codicon,
    tooltip: impl Into<SharedString>,
    active: bool,
    theme: &ActiveTheme,
    on_click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> AnyElement {
    let fg = if active {
        theme.foreground()
    } else {
        theme.icon_foreground()
    };
    let bg = if active {
        theme.toolbar_active_background()
    } else {
        transparent_black()
    };
    let hover_bg = theme.toolbar_hover_background();

    div()
        .id(id)
        .flex()
        .items_center()
        .justify_center()
        .flex_shrink_0()
        .size(rem_px(26.0))
        .rounded(rem_px(theme.metrics.corner_radius_medium))
        .bg(bg)
        .cursor_pointer()
        .hover(move |style| style.bg(hover_bg))
        .tooltip(baseapp_tooltip(tooltip))
        .on_mouse_down(MouseButton::Left, |_event, _window, cx| {
            cx.stop_propagation();
        })
        .on_click(move |event, window, cx| {
            on_click(event, window, cx);
        })
        .child(codicon(icon, 16.0, fg).size(rem_px(16.0)))
        .into_any_element()
}

fn build_customize_layout_menu(
    position: Point<Pixels>,
    state: &Entity<WorkbenchState>,
    cx: &App,
) -> ContextMenuModel {
    let snapshot = state.read(cx);
    let layout = snapshot.layout();
    let sidebar_open = layout.sidebar_open;
    let auxiliary_open = layout.auxiliary_open;
    let tertiary_open = layout.tertiary_open;
    let status_bar_visible = layout.status_bar_visible;
    let side_bar_position = layout.side_bar_position;
    let compact_mode = layout.compact_mode;

    let primary_label = snapshot.t(if sidebar_open {
        "sidebar.hidePrimarySideBar"
    } else {
        "sidebar.showPrimarySideBar"
    });
    let secondary_label = snapshot.t(if auxiliary_open {
        "sidebar.hideSecondarySideBar"
    } else {
        "sidebar.showSecondarySideBar"
    });
    let tertiary_label = snapshot.t(if tertiary_open {
        "sidebar.hideTertiarySideBar"
    } else {
        "sidebar.showTertiarySideBar"
    });
    let status_label = snapshot.t("statusBar.statusBar");
    let flip_label = snapshot.t(if side_bar_position == SideBarPosition::Left {
        "sidebar.movePrimarySideBarRight"
    } else {
        "sidebar.movePrimarySideBarLeft"
    });
    let reset_views_label = snapshot.t("sidebar.resetViewLocations");
    let compact_label = snapshot.t(if compact_mode {
        "workspace.fullView"
    } else {
        "workspace.compactView"
    });
    let fullscreen_label = snapshot.t("sidebar.toggleFullScreen");
    let reset_layout_label = snapshot.t("settings.resetWindowLayoutAction");

    let primary_icon = if side_bar_position == SideBarPosition::Left {
        Codicon::LayoutSidebarLeft
    } else {
        Codicon::LayoutSidebarRight
    };
    let secondary_icon = if side_bar_position == SideBarPosition::Left {
        Codicon::LayoutSidebarRight
    } else {
        Codicon::LayoutSidebarLeft
    };
    let tertiary_icon = if tertiary_open {
        Codicon::PanelBottom
    } else {
        Codicon::PanelBottomOff
    };
    let status_icon = if status_bar_visible {
        Codicon::Check
    } else {
        Codicon::PanelBottom
    };
    let flip_icon = if side_bar_position == SideBarPosition::Left {
        Codicon::LayoutSidebarRight
    } else {
        Codicon::LayoutSidebarLeft
    };
    let compact_icon = if compact_mode {
        Codicon::ScreenNormal
    } else {
        Codicon::ScreenFull
    };

    let state_primary = state.clone();
    let state_secondary = state.clone();
    let state_tertiary = state.clone();
    let state_status = state.clone();
    let state_flip = state.clone();
    let state_reset_views = state.clone();
    let state_compact = state.clone();
    let state_fullscreen = state.clone();
    let state_reset_layout = state.clone();

    let entries = vec![
        ContextMenuEntry::action(
            "layout-toggle-primary",
            primary_label,
            move |_window, cx| {
                state_primary.update(cx, |s, cx| s.toggle_sidebar(cx));
            },
        )
        .with_icon(primary_icon),
        ContextMenuEntry::action(
            "layout-toggle-secondary",
            secondary_label,
            move |_window, cx| {
                state_secondary.update(cx, |s, cx| s.toggle_auxiliary_bar(cx));
            },
        )
        .with_icon(secondary_icon),
        ContextMenuEntry::action(
            "layout-toggle-tertiary",
            tertiary_label,
            move |_window, cx| {
                state_tertiary.update(cx, |s, cx| s.toggle_tertiary_bar(cx));
            },
        )
        .with_icon(tertiary_icon),
        ContextMenuEntry::action(
            "layout-toggle-statusbar",
            status_label,
            move |_window, cx| {
                state_status.update(cx, |s, cx| {
                    s.toggle_status_bar_visible(cx);
                });
            },
        )
        .with_icon(status_icon),
        ContextMenuEntry::separator(),
        ContextMenuEntry::action("layout-flip-sidebar", flip_label, move |_window, cx| {
            state_flip.update(cx, |s, cx| {
                s.toggle_side_bar_position(cx);
            });
        })
        .with_icon(flip_icon),
        ContextMenuEntry::action(
            "layout-reset-views",
            reset_views_label,
            move |_window, cx| {
                state_reset_views.update(cx, |s, cx| s.reset_view_locations(cx));
            },
        )
        .with_icon(Codicon::ArrowSwap),
        ContextMenuEntry::separator(),
        ContextMenuEntry::action(
            "layout-toggle-compact",
            compact_label,
            move |_window, cx| {
                state_compact.update(cx, |s, cx| s.toggle_compact_mode(cx));
            },
        )
        .with_icon(compact_icon),
        ContextMenuEntry::action(
            "layout-toggle-fullscreen",
            fullscreen_label,
            move |_window, cx| {
                state_fullscreen.update(cx, |s, cx| s.request_toggle_fullscreen(cx));
            },
        )
        .with_icon(Codicon::ScreenFull),
        ContextMenuEntry::separator(),
        ContextMenuEntry::action(
            "layout-reset-all",
            reset_layout_label,
            move |_window, cx| {
                state_reset_layout.update(cx, |s, cx| {
                    s.reset_layout(cx);
                });
            },
        )
        .with_icon(Codicon::Discard),
    ];

    ContextMenuModel::new(position, entries)
}

fn edge_sidebar_tooltip(state: &WorkbenchState, edge: SideBarPosition) -> String {
    let layout = state.layout();
    let is_primary = layout.is_primary_on_edge(edge);
    let visible = layout.is_edge_sidebar_visible(edge);
    if is_primary {
        state.t(if visible {
            "sidebar.hidePrimarySideBar"
        } else {
            "sidebar.showPrimarySideBar"
        })
    } else {
        state.t(if visible {
            "sidebar.hideSecondarySideBar"
        } else {
            "sidebar.showSecondarySideBar"
        })
    }
}

pub fn render_titlebar(
    state: &Entity<WorkbenchState>,
    overlay: &Entity<OverlayState>,
    theme: &ActiveTheme,
    _window: &mut Window,
    cx: &mut App,
) -> AnyElement {
    let snapshot = state.read(cx);
    let platform = snapshot.platform();
    let is_mac = platform == DesktopPlatform::Darwin;
    let layout = snapshot.layout();
    let page = layout.page;
    let compact_mode = layout.compact_mode;
    let maximized = layout.maximized;
    let left_visible = layout.is_edge_sidebar_visible(SideBarPosition::Left);
    let right_visible = layout.is_edge_sidebar_visible(SideBarPosition::Right);
    let bottom_visible = !compact_mode && layout.tertiary_open;
    let primary_on_left = layout.is_primary_on_edge(SideBarPosition::Left);

    let always_on_top = snapshot.config().always_on_top;
    let theme_mode = snapshot.config().theme;
    let opacity_percent =
        (clamp_window_opacity(snapshot.effective_window_opacity()) * 100.0).round();

    let app_name = snapshot.t("app.name");
    let compact_tooltip = snapshot.t(if compact_mode {
        "workspace.fullView"
    } else {
        "workspace.compactView"
    });
    let opacity_tooltip = format!(
        "{}: {}%",
        snapshot.t("settings.windowOpacity"),
        opacity_percent as i64
    );
    let window_title = snapshot.window_title();
    let left_sidebar_tooltip = edge_sidebar_tooltip(snapshot, SideBarPosition::Left);
    let bottom_sidebar_tooltip = snapshot.t(if bottom_visible {
        "sidebar.hideTertiarySideBar"
    } else {
        "sidebar.showTertiarySideBar"
    });
    let right_sidebar_tooltip = edge_sidebar_tooltip(snapshot, SideBarPosition::Right);
    let customize_tooltip = snapshot.t("sidebar.customizeLayout");
    let always_on_top_tooltip = snapshot.t("settings.alwaysOnTop");
    let theme_tooltip = snapshot.t(&format!("themes.{}", theme_mode.as_str()));
    let settings_tooltip = snapshot.t("nav.settings");
    let minimize_tooltip = snapshot.t("windowControls.minimize");
    let maximize_tooltip = snapshot.t(if maximized {
        "windowControls.restore"
    } else {
        "windowControls.maximize"
    });
    let close_tooltip = snapshot.t("windowControls.close");

    let hover_bg = theme.toolbar_hover_background();

    let state_brand = state.clone();
    let brand_button = div()
        .id("titlebar-brand")
        .flex()
        .items_center()
        .justify_center()
        .flex_shrink_0()
        .size(rem_px(26.0))
        .rounded(rem_px(theme.metrics.corner_radius_medium))
        .cursor_pointer()
        .hover(move |style| style.bg(hover_bg))
        .tooltip(baseapp_tooltip(app_name))
        .on_mouse_down(MouseButton::Left, |_event, _window, cx| {
            cx.stop_propagation();
        })
        .on_click(move |_event, _window, cx| {
            state_brand.update(cx, |s, cx| s.set_page(WorkbenchPage::Home, cx));
        })
        .child(brand_logo(18.0).size(rem_px(18.0)));

    let state_compact = state.clone();
    let compact_button = titlebar_icon_button(
        "titlebar-compact",
        if compact_mode {
            Codicon::ScreenNormal
        } else {
            Codicon::ScreenFull
        },
        compact_tooltip,
        compact_mode,
        theme,
        move |_event, _window, cx| {
            state_compact.update(cx, |s, cx| {
                if s.layout().page != WorkbenchPage::Home {
                    s.set_page(WorkbenchPage::Home, cx);
                    s.set_compact_mode(true, cx);
                } else {
                    s.toggle_compact_mode(cx);
                }
            });
        },
    );

    let mut left_group = div()
        .flex()
        .items_center()
        .gap(rem_px(4.0))
        .h_full()
        .pl(if is_mac { rem_px(76.0) } else { rem_px(8.0) })
        .pr(rem_px(4.0))
        .flex_shrink_0()
        .child(brand_button)
        .child(compact_button);

    if compact_mode && page == WorkbenchPage::Home {
        let state_opacity = state.clone();
        let slider = Slider::new(
            "titlebar-opacity-slider",
            10.0,
            100.0,
            10.0,
            opacity_percent,
        )
        .value_label(format!("{}%", opacity_percent as i64))
        .on_change(move |percent, _window, cx| {
            let snapped = snap_window_opacity(percent / 100.0);
            state_opacity.update(cx, |s, cx| {
                s.set_live_window_opacity(snapped, cx);
                s.update_configuration(
                    AppConfigurationPatch {
                        window_opacity: Some(snapped),
                        ..Default::default()
                    },
                    cx,
                );
            });
        });

        left_group = left_group.child(
            div()
                .id("titlebar-opacity-wrap")
                .flex()
                .items_center()
                .w(rem_px(160.0))
                .pl(rem_px(4.0))
                .tooltip(baseapp_tooltip(opacity_tooltip))
                .on_mouse_down(MouseButton::Left, |_event, _window, cx| {
                    cx.stop_propagation();
                })
                .child(slider),
        );
    }

    let center_title = div()
        .flex_1()
        .min_w_0()
        .h_full()
        .flex()
        .items_center()
        .justify_center()
        .px(rem_px(12.0))
        .window_control_area(WindowControlArea::Drag)
        .child(
            div()
                .min_w_0()
                .overflow_hidden()
                .whitespace_nowrap()
                .text_ellipsis()
                .text_size(rem_px(12.0))
                .line_height(rem_px(20.0))
                .text_color(theme.title_bar_active_foreground())
                .child(window_title),
        );

    let mut right_group = div().flex().items_center().h_full().flex_shrink_0();

    if !compact_mode {
        let state_left_toggle = state.clone();
        let left_toggle = titlebar_icon_button(
            "titlebar-toggle-left-sidebar",
            if left_visible {
                Codicon::LayoutSidebarLeft
            } else {
                Codicon::LayoutSidebarLeftOff
            },
            left_sidebar_tooltip,
            false,
            theme,
            move |_event, _window, cx| {
                state_left_toggle.update(cx, |s, cx| {
                    if primary_on_left {
                        s.toggle_sidebar(cx);
                    } else {
                        s.toggle_auxiliary_bar(cx);
                    }
                });
            },
        );

        let state_bottom_toggle = state.clone();
        let bottom_toggle = titlebar_icon_button(
            "titlebar-toggle-tertiary-bar",
            if bottom_visible {
                Codicon::PanelBottom
            } else {
                Codicon::PanelBottomOff
            },
            bottom_sidebar_tooltip,
            false,
            theme,
            move |_event, _window, cx| {
                state_bottom_toggle.update(cx, |s, cx| s.toggle_tertiary_bar(cx));
            },
        );

        let state_right_toggle = state.clone();
        let right_toggle = titlebar_icon_button(
            "titlebar-toggle-right-sidebar",
            if right_visible {
                Codicon::LayoutSidebarRight
            } else {
                Codicon::LayoutSidebarRightOff
            },
            right_sidebar_tooltip,
            false,
            theme,
            move |_event, _window, cx| {
                state_right_toggle.update(cx, |s, cx| {
                    if primary_on_left {
                        s.toggle_auxiliary_bar(cx);
                    } else {
                        s.toggle_sidebar(cx);
                    }
                });
            },
        );

        let state_customize = state.clone();
        let overlay_customize = overlay.clone();
        let customize_button = titlebar_icon_button(
            "titlebar-customize-layout",
            Codicon::Layout,
            customize_tooltip,
            false,
            theme,
            move |event, _window, cx| {
                let pos = event.position();
                let anchor = point(pos.x, pos.y + px(8.0));
                let menu = build_customize_layout_menu(anchor, &state_customize, cx);
                overlay_customize.update(cx, |ov, cx| ov.open_context_menu(menu, cx));
            },
        );

        let state_pin = state.clone();
        let pin_button = titlebar_icon_button(
            "titlebar-always-on-top",
            if always_on_top {
                Codicon::Pinned
            } else {
                Codicon::Pin
            },
            always_on_top_tooltip,
            always_on_top,
            theme,
            move |_event, _window, cx| {
                state_pin.update(cx, |s, cx| {
                    s.toggle_always_on_top(cx);
                });
            },
        );

        let state_theme = state.clone();
        let theme_button = titlebar_icon_button(
            "titlebar-cycle-theme",
            theme_icon(theme_mode),
            theme_tooltip,
            false,
            theme,
            move |_event, _window, cx| {
                state_theme.update(cx, |s, cx| {
                    s.cycle_theme(cx);
                });
            },
        );

        let state_settings = state.clone();
        let settings_button = titlebar_icon_button(
            "titlebar-settings",
            Codicon::SettingsGear,
            settings_tooltip,
            page == WorkbenchPage::Settings,
            theme,
            move |_event, _window, cx| {
                state_settings.update(cx, |s, cx| s.toggle_settings(cx));
            },
        );

        right_group = right_group
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(rem_px(2.0))
                    .child(left_toggle)
                    .child(bottom_toggle)
                    .child(right_toggle)
                    .child(customize_button),
            )
            .child(
                div()
                    .w(px(1.0))
                    .h(rem_px(16.0))
                    .mx(rem_px(6.0))
                    .bg(theme.title_bar_border()),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(rem_px(2.0))
                    .pr(rem_px(6.0))
                    .child(pin_button)
                    .child(theme_button)
                    .child(settings_button),
            );
    }

    if !is_mac {
        let icon_fg = theme.title_bar_active_foreground();
        let close_hover_bg = rgb(0xE81123);
        let close_hover_fg = rgb(0xFFFFFF);

        let min_btn = div()
            .id("window-control-minimize")
            .flex()
            .items_center()
            .justify_center()
            .w(rem_px(46.0))
            .h_full()
            .window_control_area(WindowControlArea::Min)
            .cursor_pointer()
            .hover(move |style| style.bg(hover_bg))
            .tooltip(baseapp_tooltip(minimize_tooltip))
            .on_click(|_event, window, _cx| {
                window.minimize_window();
            })
            .child(codicon(Codicon::ChromeMinimize, 16.0, icon_fg).size(rem_px(16.0)));

        let state_max = state.clone();
        let max_btn = div()
            .id("window-control-maximize")
            .flex()
            .items_center()
            .justify_center()
            .w(rem_px(46.0))
            .h_full()
            .window_control_area(WindowControlArea::Max)
            .cursor_pointer()
            .hover(move |style| style.bg(hover_bg))
            .tooltip(baseapp_tooltip(maximize_tooltip))
            .on_click(move |_event, window, cx| {
                window.zoom_window();
                let next_maximized = window.is_maximized();
                state_max.update(cx, |s, cx| s.set_maximized(next_maximized, cx));
            })
            .child(
                codicon(
                    if maximized {
                        Codicon::ChromeRestore
                    } else {
                        Codicon::ChromeMaximize
                    },
                    16.0,
                    icon_fg,
                )
                .size(rem_px(16.0)),
            );

        let state_close = state.clone();
        let close_btn = div()
            .id("window-control-close")
            .flex()
            .items_center()
            .justify_center()
            .w(rem_px(46.0))
            .h_full()
            .window_control_area(WindowControlArea::Close)
            .cursor_pointer()
            .hover(move |style| style.bg(close_hover_bg).text_color(close_hover_fg))
            .tooltip(baseapp_tooltip(close_tooltip))
            .on_click(move |_event, window, cx| {
                let minimize_to_tray = {
                    let config = state_close.read(cx).config();
                    config.show_tray_icon && config.minimize_to_tray_on_close
                };
                if minimize_to_tray {
                    window.minimize_window();
                } else {
                    window.remove_window();
                    state_close.update(cx, |s, cx| s.request_quit(cx));
                }
            })
            .child(codicon(Codicon::ChromeClose, 16.0, icon_fg).size(rem_px(16.0)));

        right_group = right_group.child(
            div()
                .flex()
                .items_center()
                .h_full()
                .child(min_btn)
                .child(max_btn)
                .child(close_btn),
        );
    }

    div()
        .id("workbench-titlebar")
        .flex()
        .items_center()
        .justify_between()
        .w_full()
        .h(rem_px(theme.metrics.titlebar_height))
        .flex_shrink_0()
        .bg(theme.title_bar_active_background())
        .text_color(theme.title_bar_active_foreground())
        .border_b_1()
        .border_color(theme.title_bar_border())
        .child(left_group)
        .child(center_title)
        .child(right_group)
        .into_any_element()
}
