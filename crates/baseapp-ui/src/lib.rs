pub mod assets;
pub mod icon;
pub mod theme;
pub mod widgets;

pub use assets::{BRAND_LOGO_ASSET_PATH, BRAND_LOGO_SVG_ASSET_PATH, BaseAppAssets};
pub use icon::{Codicon, brand_logo, codicon};
pub use theme::{
    ActiveTheme, MONO_FONT_FAMILY, UI_FONT_FAMILY, color_to_hsla, color_to_rgba, rem_px,
    scaled_rem_size,
};
pub use widgets::{
    ActionBar, ActionBarItem, BaseAppTooltip, Button, ButtonVariant, Checkbox, ConfirmDialogModel,
    ContextMenuEntry, ContextMenuModel, DialogModel, INPUT_KEY_CONTEXT, InputBackspace, InputBox,
    InputBoxEvent, InputBoxState, InputCopy, InputCut, InputDelete, InputEnd, InputEnter,
    InputEscape, InputHome, InputLeft, InputPaste, InputRight, InputSelectAll, InputSelectLeft,
    InputSelectRight, ProgressBar, PromptDialogModel, Sash, SashOrientation, SegmentedControl,
    SegmentedOption, SelectBox, SelectBoxEvent, SelectBoxState, SelectOption, SelectTrigger,
    Slider, baseapp_tooltip, clamp_context_menu_position, register_input_keybindings,
    render_context_menu_overlay, render_dialog_overlay, select_options_to_menu_entries,
    select_trigger, slider_value_for_ratio, validate_prompt_value,
};

pub fn ui_version() -> &'static str {
    baseapp_platform::platform_version()
}

#[cfg(test)]
mod tests {
    use super::ui_version;

    #[test]
    fn links_platform_layer() {
        assert_eq!(ui_version(), "3.0.0");
    }
}
