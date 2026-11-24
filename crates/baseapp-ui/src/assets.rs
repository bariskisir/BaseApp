use std::borrow::Cow;

use gpui::{AssetSource, Result, SharedString};

use crate::icon::Codicon;

pub const BRAND_LOGO_ASSET_PATH: &str = "brand/icon.png";
pub const BRAND_LOGO_SVG_ASSET_PATH: &str = "brand/icon.svg";

const BRAND_ICON_PNG: &[u8] = include_bytes!("../../../build/icon.png");
const BRAND_ICON_SVG: &[u8] = include_bytes!("../../../build/icon.svg");

#[derive(Debug, Clone, Copy, Default)]
pub struct BaseAppAssets;

impl BaseAppAssets {
    fn load_embedded(path: &str) -> Option<&'static [u8]> {
        match path {
            "icons/files.svg" => Some(include_bytes!("../assets/icons/files.svg")),
            "icons/settings-gear.svg" => Some(include_bytes!("../assets/icons/settings-gear.svg")),
            "icons/search.svg" => Some(include_bytes!("../assets/icons/search.svg")),
            "icons/add.svg" => Some(include_bytes!("../assets/icons/add.svg")),
            "icons/trash.svg" => Some(include_bytes!("../assets/icons/trash.svg")),
            "icons/pin.svg" => Some(include_bytes!("../assets/icons/pin.svg")),
            "icons/pinned.svg" => Some(include_bytes!("../assets/icons/pinned.svg")),
            "icons/edit.svg" => Some(include_bytes!("../assets/icons/edit.svg")),
            "icons/close.svg" => Some(include_bytes!("../assets/icons/close.svg")),
            "icons/chrome-minimize.svg" => {
                Some(include_bytes!("../assets/icons/chrome-minimize.svg"))
            }
            "icons/chrome-maximize.svg" => {
                Some(include_bytes!("../assets/icons/chrome-maximize.svg"))
            }
            "icons/chrome-restore.svg" => {
                Some(include_bytes!("../assets/icons/chrome-restore.svg"))
            }
            "icons/chrome-close.svg" => Some(include_bytes!("../assets/icons/chrome-close.svg")),
            "icons/layout-sidebar-left.svg" => {
                Some(include_bytes!("../assets/icons/layout-sidebar-left.svg"))
            }
            "icons/layout-sidebar-left-off.svg" => Some(include_bytes!(
                "../assets/icons/layout-sidebar-left-off.svg"
            )),
            "icons/layout-sidebar-right.svg" => {
                Some(include_bytes!("../assets/icons/layout-sidebar-right.svg"))
            }
            "icons/layout-sidebar-right-off.svg" => Some(include_bytes!(
                "../assets/icons/layout-sidebar-right-off.svg"
            )),
            "icons/layout.svg" => Some(include_bytes!("../assets/icons/layout.svg")),
            "icons/screen-full.svg" => Some(include_bytes!("../assets/icons/screen-full.svg")),
            "icons/screen-normal.svg" => Some(include_bytes!("../assets/icons/screen-normal.svg")),
            "icons/color-mode.svg" => Some(include_bytes!("../assets/icons/color-mode.svg")),
            "icons/sun.svg" => Some(include_bytes!("../assets/icons/sun.svg")),
            "icons/moon.svg" => Some(include_bytes!("../assets/icons/moon.svg")),
            "icons/device-desktop.svg" => {
                Some(include_bytes!("../assets/icons/device-desktop.svg"))
            }
            "icons/info.svg" => Some(include_bytes!("../assets/icons/info.svg")),
            "icons/warning.svg" => Some(include_bytes!("../assets/icons/warning.svg")),
            "icons/error.svg" => Some(include_bytes!("../assets/icons/error.svg")),
            "icons/check.svg" => Some(include_bytes!("../assets/icons/check.svg")),
            "icons/chevron-down.svg" => Some(include_bytes!("../assets/icons/chevron-down.svg")),
            "icons/refresh.svg" => Some(include_bytes!("../assets/icons/refresh.svg")),
            "icons/folder-opened.svg" => Some(include_bytes!("../assets/icons/folder-opened.svg")),
            "icons/cloud-download.svg" => {
                Some(include_bytes!("../assets/icons/cloud-download.svg"))
            }
            "icons/cloud-upload.svg" => Some(include_bytes!("../assets/icons/cloud-upload.svg")),
            "icons/discard.svg" => Some(include_bytes!("../assets/icons/discard.svg")),
            "icons/link-external.svg" => Some(include_bytes!("../assets/icons/link-external.svg")),
            "icons/shield.svg" => Some(include_bytes!("../assets/icons/shield.svg")),
            "icons/window.svg" => Some(include_bytes!("../assets/icons/window.svg")),
            "icons/panel-bottom.svg" => Some(include_bytes!("../assets/icons/panel-bottom.svg")),
            "icons/panel-bottom-off.svg" => {
                Some(include_bytes!("../assets/icons/panel-bottom-off.svg"))
            }
            "icons/cpu.svg" => Some(include_bytes!("../assets/icons/cpu.svg")),
            "icons/globe.svg" => Some(include_bytes!("../assets/icons/globe.svg")),
            "icons/pass.svg" => Some(include_bytes!("../assets/icons/pass.svg")),
            "icons/loading.svg" => Some(include_bytes!("../assets/icons/loading.svg")),
            "icons/minus.svg" => Some(include_bytes!("../assets/icons/minus.svg")),
            "icons/plus.svg" => Some(include_bytes!("../assets/icons/plus.svg")),
            "icons/clear-all.svg" => Some(include_bytes!("../assets/icons/clear-all.svg")),
            "icons/zoom-in.svg" => Some(include_bytes!("../assets/icons/zoom-in.svg")),
            "icons/zoom-out.svg" => Some(include_bytes!("../assets/icons/zoom-out.svg")),
            "icons/arrow-swap.svg" => Some(include_bytes!("../assets/icons/arrow-swap.svg")),
            BRAND_LOGO_ASSET_PATH => Some(BRAND_ICON_PNG),
            BRAND_LOGO_SVG_ASSET_PATH => Some(BRAND_ICON_SVG),
            _ => None,
        }
    }

    fn all_paths() -> impl Iterator<Item = &'static str> {
        Codicon::ALL
            .iter()
            .map(|icon| icon.asset_path())
            .chain([BRAND_LOGO_ASSET_PATH, BRAND_LOGO_SVG_ASSET_PATH])
    }
}

impl AssetSource for BaseAppAssets {
    fn load(&self, path: &str) -> Result<Option<Cow<'static, [u8]>>> {
        Ok(Self::load_embedded(path).map(Cow::Borrowed))
    }

    fn list(&self, path: &str) -> Result<Vec<SharedString>> {
        let prefix = path.trim_end_matches('/');
        let entries = Self::all_paths()
            .filter(|candidate| {
                prefix.is_empty()
                    || *candidate == prefix
                    || (candidate.starts_with(prefix)
                        && candidate.as_bytes().get(prefix.len()) == Some(&b'/'))
            })
            .map(SharedString::from)
            .collect();
        Ok(entries)
    }
}
