#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::cell::{Cell, RefCell};
use std::env;
use std::path::PathBuf;
use std::process::Command;
use std::rc::Rc;
use std::sync::Arc;
use std::time::Duration;

use baseapp_base::platform::current_platform;
use baseapp_platform::{
    APP_ID, APP_NAME, DEFAULT_WINDOW_HEIGHT, DEFAULT_WINDOW_WIDTH, DisplayWorkArea,
    EnvironmentPaths, PersistedWindowState, ProductInfo, SystemNativeHost, TrayAction, TrayManager,
    WindowBounds, apply_always_on_top, apply_content_protection, apply_show_in_taskbar,
    apply_window_opacity, fit_window_bounds_to_displays,
};
use baseapp_ui::{ActiveTheme, BaseAppAssets, register_input_keybindings, scaled_rem_size};
use baseapp_workbench::{
    WorkbenchEvent, WorkbenchServices, WorkbenchState, WorkbenchView,
    register_workbench_keybindings,
};
use gpui::{
    App, AppContext, Bounds, TitlebarOptions, Window, WindowAppearance, WindowOptions, point, px,
    size,
};
use raw_window_handle::HasWindowHandle;
use single_instance::SingleInstance;
use tracing_subscriber::EnvFilter;

const TRAY_POLL_INTERVAL: Duration = Duration::from_millis(120);
const MIN_WINDOW_WIDTH: f32 = 640.0;
const MIN_WINDOW_HEIGHT: f32 = 480.0;
const TRAFFIC_LIGHT_X: f32 = 12.0;
const TRAFFIC_LIGHT_Y: f32 = 10.0;

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("warn"));
    let _ = tracing_subscriber::fmt().with_env_filter(filter).try_init();
}

fn env_flag_enabled(name: &str) -> bool {
    env::var(name)
        .map(|value| value.trim() == "1")
        .unwrap_or(false)
}

fn parse_smoke_exit_ms(raw: Option<&str>) -> Option<u64> {
    raw.and_then(|value| value.trim().parse::<u64>().ok())
        .filter(|ms| *ms > 0)
}

fn resolve_environment_paths() -> EnvironmentPaths {
    if let Some(dir) = env::var_os("BASEAPP_DATA_DIR")
        && !dir.is_empty()
    {
        return EnvironmentPaths::from_root(PathBuf::from(dir), current_platform());
    }
    EnvironmentPaths::resolve_default()
}

fn is_dark_appearance(appearance: WindowAppearance) -> bool {
    matches!(
        appearance,
        WindowAppearance::Dark | WindowAppearance::VibrantDark
    )
}

fn build_gpui_window_bounds(
    persisted: Option<&PersistedWindowState>,
    work_areas: &[DisplayWorkArea],
) -> Option<gpui::WindowBounds> {
    let saved = persisted?;
    let fitted = fit_window_bounds_to_displays(&saved.bounds, work_areas)?;
    let rect = Bounds::new(
        point(px(fitted.x as f32), px(fitted.y as f32)),
        size(px(fitted.width as f32), px(fitted.height as f32)),
    );
    Some(if saved.full_screen {
        gpui::WindowBounds::Fullscreen(rect)
    } else if saved.maximized {
        gpui::WindowBounds::Maximized(rect)
    } else {
        gpui::WindowBounds::Windowed(rect)
    })
}

fn resolve_initial_window_bounds(
    persisted: Option<&PersistedWindowState>,
    cx: &App,
) -> gpui::WindowBounds {
    let work_areas: Vec<DisplayWorkArea> = cx
        .displays()
        .into_iter()
        .map(|display| {
            let bounds = display.visible_bounds();
            DisplayWorkArea {
                x: bounds.origin.x.as_f32().round() as i32,
                y: bounds.origin.y.as_f32().round() as i32,
                width: bounds.size.width.as_f32().round() as i32,
                height: bounds.size.height.as_f32().round() as i32,
            }
        })
        .collect();

    if let Some(restored) = build_gpui_window_bounds(persisted, &work_areas) {
        return restored;
    }

    gpui::WindowBounds::centered(
        None,
        size(
            px(DEFAULT_WINDOW_WIDTH as f32),
            px(DEFAULT_WINDOW_HEIGHT as f32),
        ),
        cx,
    )
}

fn capture_window_bounds(window: &Window) -> WindowBounds {
    let rect = window.window_bounds().get_bounds();
    WindowBounds {
        x: rect.origin.x.as_f32().round() as i32,
        y: rect.origin.y.as_f32().round() as i32,
        width: rect.size.width.as_f32().round().max(1.0) as i32,
        height: rect.size.height.as_f32().round().max(1.0) as i32,
    }
}

fn apply_window_effects(window: &Window, state: &WorkbenchState) {
    let raw_handle = match HasWindowHandle::window_handle(window) {
        Ok(handle) => handle.as_raw(),
        Err(_) => return,
    };
    let config = state.config();
    let log = state.log_service();
    if let Err(error) = apply_always_on_top(raw_handle, config.always_on_top) {
        log.warn(
            "Main",
            &format!("Always-on-top could not be applied: {error}"),
        );
    }
    if let Err(error) = apply_window_opacity(raw_handle, state.effective_window_opacity()) {
        log.warn(
            "Main",
            &format!("Window opacity could not be applied: {error}"),
        );
    }
    if let Err(error) = apply_content_protection(raw_handle, config.content_protection) {
        log.warn(
            "Main",
            &format!("Content protection could not be applied: {error}"),
        );
    }
    if let Err(error) = apply_show_in_taskbar(raw_handle, config.show_taskbar) {
        log.warn(
            "Main",
            &format!("Taskbar visibility could not be applied: {error}"),
        );
    }
}

fn spawn_relaunch(state: &WorkbenchState) {
    match env::current_exe() {
        Ok(executable) => {
            let mut command = Command::new(executable);
            command.args(env::args_os().skip(1));
            if let Err(error) = command.spawn() {
                state
                    .log_service()
                    .error("Main", &format!("Application relaunch failed: {error}"));
            }
        }
        Err(error) => {
            state.log_service().error(
                "Main",
                &format!("Current executable could not be resolved for relaunch: {error}"),
            );
        }
    }
}

fn main() {
    init_tracing();

    let single_instance = if env_flag_enabled("BASEAPP_ALLOW_MULTI_INSTANCE") {
        None
    } else {
        match SingleInstance::new(APP_ID) {
            Ok(instance) => {
                if !instance.is_single() {
                    return;
                }
                Some(instance)
            }
            Err(error) => {
                tracing::warn!("Single-instance lock could not be acquired: {error}");
                None
            }
        }
    };

    let paths = resolve_environment_paths();
    let product = ProductInfo::default();
    let native_host = SystemNativeHost::new(
        product.clone(),
        paths.clone(),
        env!("BASEAPP_RUSTC_VERSION"),
        env!("BASEAPP_GPUI_VERSION"),
    );

    let services = match WorkbenchServices::from_environment(
        paths.clone(),
        product.clone(),
        Arc::new(native_host),
    ) {
        Ok(services) => services,
        Err(error) => {
            tracing::error!("Application services could not be initialized: {error}");
            return;
        }
    };

    let initial_config = services.config_service.get();
    let persisted_window_state = services.window_state_store.load().ok().flatten();
    let smoke_exit_ms = parse_smoke_exit_ms(env::var("BASEAPP_SMOKE_EXIT_MS").ok().as_deref());
    let disable_auto_update = env_flag_enabled("BASEAPP_DISABLE_AUTO_UPDATE");

    gpui_platform::application()
        .with_assets(BaseAppAssets)
        .run(move |cx: &mut App| {
            register_input_keybindings(cx);
            register_workbench_keybindings(cx);

            let initial_bounds = resolve_initial_window_bounds(persisted_window_state.as_ref(), cx);
            let start_hidden_to_tray =
                initial_config.start_minimized && initial_config.show_tray_icon;
            let options = WindowOptions {
                window_bounds: Some(initial_bounds),
                titlebar: Some(TitlebarOptions {
                    title: Some(APP_NAME.into()),
                    appears_transparent: true,
                    traffic_light_position: Some(point(px(TRAFFIC_LIGHT_X), px(TRAFFIC_LIGHT_Y))),
                }),
                window_min_size: Some(size(px(MIN_WINDOW_WIDTH), px(MIN_WINDOW_HEIGHT))),
                app_id: Some(APP_ID.to_string()),
                show: !start_hidden_to_tray,
                focus: !start_hidden_to_tray,
                ..WindowOptions::default()
            };

            let single_instance_slot = Rc::new(RefCell::new(single_instance));
            let open_result =
                cx.open_window(options, move |window, cx| {
                    let system_is_dark = is_dark_appearance(window.appearance());
                    let state = cx.new(|_| WorkbenchState::initialize(services, system_is_dark));

                    let (
                        initial_theme,
                        initial_zoom,
                        initial_title,
                        initial_tray,
                        platform,
                        app_name,
                    ) = {
                        let guard = state.read(cx);
                        (
                            guard.resolved_theme(),
                            guard.config().zoom_level,
                            guard.window_title(),
                            guard.tray_configuration(),
                            guard.platform(),
                            guard.product().name.clone(),
                        )
                    };

                    ActiveTheme::set(cx, initial_theme);
                    window.set_rem_size(scaled_rem_size(initial_zoom));
                    window.set_window_title(&initial_title);
                    apply_window_effects(window, state.read(cx));

                    let tray_manager = Rc::new(RefCell::new(TrayManager::new(platform, app_name)));
                    {
                        let guard = state.read(cx);
                        if let Err(error) = tray_manager
                            .borrow_mut()
                            .apply_configuration(initial_tray, guard.localization())
                        {
                            guard.log_service().warn(
                                "Main",
                                &format!("Initial system tray setup failed: {error}"),
                            );
                        }
                    }
                    let is_quitting = Rc::new(Cell::new(false));
                    let window_handle = Window::window_handle(window);

                    let state_for_appearance = state.clone();
                    window
                        .observe_window_appearance(move |window, cx| {
                            let is_dark = is_dark_appearance(window.appearance());
                            state_for_appearance.update(cx, |state, cx| {
                                state.set_system_is_dark(is_dark, cx);
                            });
                        })
                        .detach();

                    let mut last_title = initial_title;
                    cx.observe(&state, move |state, cx| {
                        let next_title = state.read(cx).window_title();
                        if next_title != last_title {
                            last_title = next_title.clone();
                            let _ = window_handle.update(cx, |_, window, _| {
                                window.set_window_title(&next_title);
                            });
                        }
                    })
                    .detach();

                    let tray_for_events = Rc::clone(&tray_manager);
                    let quitting_for_events = Rc::clone(&is_quitting);
                    let single_instance_for_events = Rc::clone(&single_instance_slot);
                    cx.subscribe(&state, move |state, event, cx| match event {
                        WorkbenchEvent::WindowEffectsChanged => {
                            let _ = window_handle.update(cx, |_, window, cx| {
                                apply_window_effects(window, state.read(cx));
                            });
                        }
                        WorkbenchEvent::TrayConfigChanged(tray_config) => {
                            let result = {
                                let guard = state.read(cx);
                                tray_for_events
                                    .borrow_mut()
                                    .apply_configuration(*tray_config, guard.localization())
                            };
                            if let Err(error) = result {
                                state.read(cx).log_service().warn(
                                    "Main",
                                    &format!(
                                        "System tray configuration could not be updated: {error}"
                                    ),
                                );
                            }
                        }
                        WorkbenchEvent::RelaunchRequested => {
                            quitting_for_events.set(true);
                            tray_for_events.borrow_mut().prepare_to_quit();
                            single_instance_for_events.borrow_mut().take();
                            spawn_relaunch(state.read(cx));
                            cx.quit();
                        }
                        WorkbenchEvent::QuitRequested => {
                            quitting_for_events.set(true);
                            tray_for_events.borrow_mut().prepare_to_quit();
                            cx.quit();
                        }
                        WorkbenchEvent::ThemeChanged(_)
                        | WorkbenchEvent::ZoomChanged(_)
                        | WorkbenchEvent::ToggleFullScreenRequested => {}
                    })
                    .detach();

                    let tray_for_poll = Rc::clone(&tray_manager);
                    let quitting_for_poll = Rc::clone(&is_quitting);
                    let state_for_poll = state.clone();
                    window
                        .spawn(cx, async move |async_cx| {
                            loop {
                                async_cx
                                    .background_executor()
                                    .timer(TRAY_POLL_INTERVAL)
                                    .await;
                                if quitting_for_poll.get() {
                                    break;
                                }
                                let Some(action) = tray_for_poll.borrow().poll_action() else {
                                    continue;
                                };
                                let update_result = async_cx.update(|window, cx| match action {
                                    TrayAction::Open => {
                                        cx.activate(true);
                                        window.activate_window();
                                    }
                                    TrayAction::OpenSettings => {
                                        state_for_poll.update(cx, |state, cx| {
                                            state.open_settings(None, cx);
                                        });
                                        cx.activate(true);
                                        window.activate_window();
                                    }
                                    TrayAction::Exit => {
                                        quitting_for_poll.set(true);
                                        tray_for_poll.borrow_mut().prepare_to_quit();
                                        cx.quit();
                                    }
                                });
                                if update_result.is_err() {
                                    break;
                                }
                            }
                        })
                        .detach();

                    let tray_for_close = Rc::clone(&tray_manager);
                    let quitting_for_close = Rc::clone(&is_quitting);
                    let state_for_close = state.clone();
                    window.on_window_should_close(cx, move |window, cx| {
                        let current_bounds = capture_window_bounds(window);
                        let maximized = window.is_maximized();
                        let fullscreen = window.is_fullscreen();
                        state_for_close.update(cx, |state, _| {
                            state.persist_window_bounds(current_bounds, maximized, fullscreen);
                        });
                        if !quitting_for_close.get()
                            && tray_for_close.borrow().should_minimize_on_close()
                        {
                            window.minimize_window();
                            return false;
                        }
                        quitting_for_close.set(true);
                        tray_for_close.borrow_mut().prepare_to_quit();
                        true
                    });

                    cx.on_window_closed(|cx| {
                        if cx.windows().is_empty() {
                            cx.quit();
                        }
                    })
                    .detach();

                    if let Some(delay_ms) = smoke_exit_ms {
                        let tray_for_smoke = Rc::clone(&tray_manager);
                        let quitting_for_smoke = Rc::clone(&is_quitting);
                        cx.spawn(async move |async_app| {
                            async_app
                                .background_executor()
                                .timer(Duration::from_millis(delay_ms))
                                .await;
                            async_app.update(|cx| {
                                quitting_for_smoke.set(true);
                                tray_for_smoke.borrow_mut().prepare_to_quit();
                                cx.quit();
                            });
                        })
                        .detach();
                    }

                    if initial_config.auto_update && !disable_auto_update {
                        let state_for_update = state.clone();
                        cx.defer(move |cx| {
                            let should_check = state_for_update.read(cx).startup_error().is_none();
                            if should_check {
                                state_for_update.update(cx, |state, cx| {
                                    state.check_for_updates(cx);
                                });
                            }
                        });
                    }

                    cx.new(|cx| WorkbenchView::new(state, window, cx))
                });

            if let Err(error) = open_result {
                tracing::error!("Main window could not be opened: {error}");
                cx.quit();
            }
        });
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use baseapp_base::platform::DesktopPlatform;
    use baseapp_platform::{
        DisplayWorkArea, EnvironmentPaths, PersistedWindowState, ProductInfo, SystemNativeHost,
        WindowBounds,
    };
    use baseapp_ui::{ActiveTheme, register_input_keybindings};
    use baseapp_workbench::{
        WorkbenchServices, WorkbenchState, WorkbenchView, register_workbench_keybindings,
    };
    use gpui::{AppContext, TestAppContext, WindowAppearance, px};
    use tempfile::TempDir;

    use super::{build_gpui_window_bounds, is_dark_appearance, parse_smoke_exit_ms};

    #[test]
    fn maps_window_appearance_to_dark_flag() {
        assert!(is_dark_appearance(WindowAppearance::Dark));
        assert!(is_dark_appearance(WindowAppearance::VibrantDark));
        assert!(!is_dark_appearance(WindowAppearance::Light));
        assert!(!is_dark_appearance(WindowAppearance::VibrantLight));
    }

    #[test]
    fn parses_smoke_exit_duration_safely() {
        assert_eq!(parse_smoke_exit_ms(None), None);
        assert_eq!(parse_smoke_exit_ms(Some("")), None);
        assert_eq!(parse_smoke_exit_ms(Some("0")), None);
        assert_eq!(parse_smoke_exit_ms(Some("invalid")), None);
        assert_eq!(parse_smoke_exit_ms(Some("250")), Some(250));
    }

    #[test]
    fn restores_windowed_maximized_and_fullscreen_bounds_when_visible() {
        let displays = [DisplayWorkArea {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        }];
        let base = PersistedWindowState {
            bounds: WindowBounds {
                x: 100,
                y: 80,
                width: 1200,
                height: 760,
            },
            ..PersistedWindowState::default()
        };

        let windowed = build_gpui_window_bounds(Some(&base), &displays).expect("windowed");
        assert!(matches!(windowed, gpui::WindowBounds::Windowed(_)));
        assert_eq!(windowed.get_bounds().origin.x, px(100.0));
        assert_eq!(windowed.get_bounds().size.width, px(1200.0));

        let maximized = PersistedWindowState {
            maximized: true,
            ..base.clone()
        };
        assert!(matches!(
            build_gpui_window_bounds(Some(&maximized), &displays),
            Some(gpui::WindowBounds::Maximized(_))
        ));

        let fullscreen = PersistedWindowState {
            full_screen: true,
            ..base.clone()
        };
        assert!(matches!(
            build_gpui_window_bounds(Some(&fullscreen), &displays),
            Some(gpui::WindowBounds::Fullscreen(_))
        ));

        let offscreen = PersistedWindowState {
            bounds: WindowBounds {
                x: 5000,
                y: 5000,
                width: 1000,
                height: 700,
            },
            ..base
        };
        assert_eq!(build_gpui_window_bounds(Some(&offscreen), &displays), None);
    }

    #[gpui::test]
    fn mounts_workbench_view_with_build_metadata(cx: &mut TestAppContext) {
        let temp = TempDir::new().expect("temp dir");
        let paths = EnvironmentPaths::from_root(temp.path().to_path_buf(), DesktopPlatform::Win32);
        let product = ProductInfo::default();
        let native_host = SystemNativeHost::new(
            product.clone(),
            paths.clone(),
            env!("BASEAPP_RUSTC_VERSION"),
            env!("BASEAPP_GPUI_VERSION"),
        );
        let services = WorkbenchServices::from_environment(paths, product, Arc::new(native_host))
            .expect("services");

        let state = cx.new(|_| WorkbenchState::initialize(services, true));
        cx.update(|cx| {
            register_input_keybindings(cx);
            register_workbench_keybindings(cx);
            let mode = state.read(cx).resolved_theme();
            ActiveTheme::set(cx, mode);
        });

        let (view, visual_cx) =
            cx.add_window_view(|window, cx| WorkbenchView::new(state.clone(), window, cx));
        visual_cx.run_until_parked();

        view.read_with(cx, |workbench, cx| {
            let mounted = workbench.state().read(cx);
            assert_eq!(mounted.runtime_info().app_version, "3.0.0");
            assert_eq!(mounted.runtime_info().gpui_version, "0.3.14");
            assert!(!mounted.runtime_info().rust_version.is_empty());
        });
    }
}
