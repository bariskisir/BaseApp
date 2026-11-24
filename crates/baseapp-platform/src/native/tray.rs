use baseapp_base::platform::{DesktopPlatform, is_tray_supported};
use image::ImageFormat;

use crate::configuration::TrayIconPreset;
use crate::localization::AppLocale;
use crate::native::NativeError;

const DEFAULT_TRAY_ICON_PNG: &[u8] = include_bytes!("../../../../build/icon.png");
const BLUETOOTH_TRAY_ICON_PNG: &[u8] = include_bytes!("../../../../build/tray-icon-bluetooth.png");
const WEATHER_TRAY_ICON_PNG: &[u8] = include_bytes!("../../../../build/tray-icon-weather.png");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TrayAction {
    Open,
    OpenSettings,
    Exit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TrayConfiguration {
    pub show_tray_icon: bool,
    pub minimize_to_tray_on_close: bool,
    pub tray_icon: TrayIconPreset,
    pub ui_language: AppLocale,
}

impl Default for TrayConfiguration {
    fn default() -> Self {
        Self {
            show_tray_icon: false,
            minimize_to_tray_on_close: false,
            tray_icon: TrayIconPreset::Default,
            ui_language: AppLocale::DEFAULT,
        }
    }
}

pub fn decode_tray_icon_rgba(preset: TrayIconPreset) -> Result<(Vec<u8>, u32, u32), NativeError> {
    let bytes = match preset {
        TrayIconPreset::Default => DEFAULT_TRAY_ICON_PNG,
        TrayIconPreset::Bluetooth => BLUETOOTH_TRAY_ICON_PNG,
        TrayIconPreset::Weather => WEATHER_TRAY_ICON_PNG,
    };
    let decoded = image::load_from_memory_with_format(bytes, ImageFormat::Png)
        .map_err(|error| NativeError::Tray(error.to_string()))?;
    let rgba = decoded.into_rgba8();
    let (width, height) = rgba.dimensions();
    Ok((rgba.into_raw(), width, height))
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
mod platform_tray {
    use tray_icon::menu::{Menu, MenuEvent, MenuId, MenuItem};
    use tray_icon::{
        Icon, MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent,
    };

    use super::{TrayAction, TrayConfiguration, decode_tray_icon_rgba};
    use crate::configuration::TrayIconPreset;
    use crate::localization::{AppLocale, LocalizationService};
    use crate::native::NativeError;
    use baseapp_base::platform::{DesktopPlatform, is_tray_supported};

    pub struct TrayManager {
        platform: DesktopPlatform,
        tooltip: String,
        configuration: TrayConfiguration,
        tray_icon: Option<TrayIcon>,
        active_preset: Option<TrayIconPreset>,
        active_locale: Option<AppLocale>,
        open_id: Option<MenuId>,
        settings_id: Option<MenuId>,
        exit_id: Option<MenuId>,
        quitting: bool,
    }

    impl TrayManager {
        pub fn new(platform: DesktopPlatform, tooltip: impl Into<String>) -> Self {
            Self {
                platform,
                tooltip: tooltip.into(),
                configuration: TrayConfiguration::default(),
                tray_icon: None,
                active_preset: None,
                active_locale: None,
                open_id: None,
                settings_id: None,
                exit_id: None,
                quitting: false,
            }
        }

        pub fn apply_configuration(
            &mut self,
            config: TrayConfiguration,
            localization: &LocalizationService,
        ) -> Result<(), NativeError> {
            self.configuration = self.normalize_configuration(config);
            if self.quitting || !self.configuration.show_tray_icon {
                self.destroy_tray_icon();
                return Ok(());
            }

            if self.tray_icon.is_some() && self.active_preset == Some(self.configuration.tray_icon)
            {
                if self.active_locale != Some(self.configuration.ui_language) {
                    let (menu, open_id, settings_id, exit_id) =
                        build_context_menu(self.configuration.ui_language, localization)?;
                    if let Some(tray) = &self.tray_icon {
                        tray.set_menu(Some(Box::new(menu)));
                    }
                    self.open_id = Some(open_id);
                    self.settings_id = Some(settings_id);
                    self.exit_id = Some(exit_id);
                    self.active_locale = Some(self.configuration.ui_language);
                }
                return Ok(());
            }

            self.destroy_tray_icon();

            let (rgba, width, height) = decode_tray_icon_rgba(self.configuration.tray_icon)?;
            let icon = Icon::from_rgba(rgba, width, height)
                .map_err(|error| NativeError::Tray(error.to_string()))?;
            let (menu, open_id, settings_id, exit_id) =
                build_context_menu(self.configuration.ui_language, localization)?;

            let tray = TrayIconBuilder::new()
                .with_tooltip(&self.tooltip)
                .with_icon(icon)
                .with_menu(Box::new(menu))
                .with_menu_on_left_click(false)
                .build()
                .map_err(|error| NativeError::Tray(error.to_string()))?;

            self.tray_icon = Some(tray);
            self.active_preset = Some(self.configuration.tray_icon);
            self.active_locale = Some(self.configuration.ui_language);
            self.open_id = Some(open_id);
            self.settings_id = Some(settings_id);
            self.exit_id = Some(exit_id);
            Ok(())
        }

        pub fn poll_action(&self) -> Option<TrayAction> {
            while let Ok(event) = MenuEvent::receiver().try_recv() {
                if self.open_id.as_ref() == Some(event.id()) {
                    return Some(TrayAction::Open);
                }
                if self.settings_id.as_ref() == Some(event.id()) {
                    return Some(TrayAction::OpenSettings);
                }
                if self.exit_id.as_ref() == Some(event.id()) {
                    return Some(TrayAction::Exit);
                }
            }
            while let Ok(event) = TrayIconEvent::receiver().try_recv() {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    return Some(TrayAction::Open);
                }
            }
            None
        }

        pub fn should_minimize_on_close(&self) -> bool {
            !self.quitting
                && self.configuration.minimize_to_tray_on_close
                && self.tray_icon.is_some()
        }

        pub fn is_active(&self) -> bool {
            self.tray_icon.is_some()
        }

        pub fn prepare_to_quit(&mut self) {
            self.quitting = true;
            self.destroy_tray_icon();
        }

        fn normalize_configuration(&self, config: TrayConfiguration) -> TrayConfiguration {
            if !is_tray_supported(self.platform) {
                return TrayConfiguration {
                    show_tray_icon: false,
                    minimize_to_tray_on_close: false,
                    tray_icon: TrayIconPreset::Default,
                    ui_language: config.ui_language,
                };
            }
            config
        }

        fn destroy_tray_icon(&mut self) {
            self.tray_icon = None;
            self.active_preset = None;
            self.active_locale = None;
            self.open_id = None;
            self.settings_id = None;
            self.exit_id = None;
        }
    }

    fn build_context_menu(
        locale: AppLocale,
        localization: &LocalizationService,
    ) -> Result<(Menu, MenuId, MenuId, MenuId), NativeError> {
        let labels = localization.tray_menu(locale);
        let menu = Menu::new();
        let open_item = MenuItem::new(labels.open, true, None);
        let settings_item = MenuItem::new(labels.settings, true, None);
        let exit_item = MenuItem::new(labels.exit, true, None);

        let open_id = open_item.id().clone();
        let settings_id = settings_item.id().clone();
        let exit_id = exit_item.id().clone();

        menu.append(&open_item)
            .map_err(|error| NativeError::Tray(error.to_string()))?;
        menu.append(&settings_item)
            .map_err(|error| NativeError::Tray(error.to_string()))?;
        menu.append(&exit_item)
            .map_err(|error| NativeError::Tray(error.to_string()))?;

        Ok((menu, open_id, settings_id, exit_id))
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
mod platform_tray {
    use super::{TrayAction, TrayConfiguration};
    use crate::localization::LocalizationService;
    use crate::native::NativeError;
    use baseapp_base::platform::DesktopPlatform;

    pub struct TrayManager {
        _platform: DesktopPlatform,
        _tooltip: String,
    }

    impl TrayManager {
        pub fn new(platform: DesktopPlatform, tooltip: impl Into<String>) -> Self {
            Self {
                _platform: platform,
                _tooltip: tooltip.into(),
            }
        }

        pub fn apply_configuration(
            &mut self,
            _config: TrayConfiguration,
            _localization: &LocalizationService,
        ) -> Result<(), NativeError> {
            Ok(())
        }

        pub fn poll_action(&self) -> Option<TrayAction> {
            None
        }

        pub fn should_minimize_on_close(&self) -> bool {
            false
        }

        pub fn is_active(&self) -> bool {
            false
        }

        pub fn prepare_to_quit(&mut self) {}
    }
}

pub use platform_tray::TrayManager;

pub const fn is_platform_tray_available(platform: DesktopPlatform) -> bool {
    is_tray_supported(platform)
}
