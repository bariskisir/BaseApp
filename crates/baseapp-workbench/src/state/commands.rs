use gpui::{Action, App, KeyBinding, OperatingSystem, actions};

actions!(
    baseapp,
    [
        ToggleAlwaysOnTop,
        CycleTheme,
        ToggleSidebar,
        ToggleAuxiliaryBar,
        ToggleTertiaryBar,
        ToggleSideBarPosition,
        ToggleStatusBar,
        ToggleCompactMode,
        ToggleFullScreen,
        ZoomIn,
        ZoomOut,
        ZoomReset,
        ResetLayout,
        OpenSettings,
        CloseSettingsTab,
        NewSession,
        Relaunch,
        DismissOverlay,
    ]
);

fn push_binding<A: Action>(bindings: &mut Vec<KeyBinding>, keystrokes: &str, action: A, cx: &App) {
    if let Ok(binding) = KeyBinding::load(keystrokes, Box::new(action), None, false, None, cx) {
        bindings.push(binding);
    }
}

pub fn register_workbench_keybindings(cx: &mut App) {
    let mut bindings = Vec::with_capacity(10);
    push_binding(&mut bindings, "secondary-,", OpenSettings, cx);
    push_binding(&mut bindings, "secondary-=", ZoomIn, cx);
    push_binding(&mut bindings, "secondary-+", ZoomIn, cx);
    push_binding(&mut bindings, "secondary--", ZoomOut, cx);
    push_binding(&mut bindings, "secondary-0", ZoomReset, cx);
    push_binding(&mut bindings, "secondary-b", ToggleSidebar, cx);
    push_binding(&mut bindings, "secondary-alt-b", ToggleAuxiliaryBar, cx);
    push_binding(&mut bindings, "secondary-j", ToggleTertiaryBar, cx);
    let fullscreen_keystroke = if cx.platform_info().os == OperatingSystem::Mac {
        "ctrl-cmd-f"
    } else {
        "f11"
    };
    push_binding(&mut bindings, fullscreen_keystroke, ToggleFullScreen, cx);
    push_binding(&mut bindings, "escape", DismissOverlay, cx);
    cx.bind_keys(bindings);
}
