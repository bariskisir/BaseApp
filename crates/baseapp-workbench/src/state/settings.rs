use std::fmt;
use std::str::FromStr;

use baseapp_ui::Codicon;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum SettingsCategoryId {
    #[default]
    General,
    Appearance,
    Tray,
    Privacy,
    System,
    Updates,
    About,
}

impl SettingsCategoryId {
    pub const ALL: &'static [Self] = &[
        Self::General,
        Self::Appearance,
        Self::Tray,
        Self::Privacy,
        Self::System,
        Self::Updates,
        Self::About,
    ];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::General => "general",
            Self::Appearance => "appearance",
            Self::Tray => "tray",
            Self::Privacy => "privacy",
            Self::System => "system",
            Self::Updates => "updates",
            Self::About => "about",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "general" => Some(Self::General),
            "appearance" => Some(Self::Appearance),
            "tray" => Some(Self::Tray),
            "privacy" => Some(Self::Privacy),
            "system" => Some(Self::System),
            "updates" => Some(Self::Updates),
            "about" => Some(Self::About),
            _ => None,
        }
    }

    pub const fn title_key(self) -> &'static str {
        match self {
            Self::General => "settings.general",
            Self::Appearance => "settings.appearance",
            Self::Tray => "settings.trayAndTaskbar",
            Self::Privacy => "settings.privacyAndData",
            Self::System => "settings.system",
            Self::Updates => "settings.updates",
            Self::About => "settings.about",
        }
    }

    pub const fn icon(self) -> Codicon {
        match self {
            Self::General => Codicon::SettingsGear,
            Self::Appearance => Codicon::ColorMode,
            Self::Tray => Codicon::PanelBottom,
            Self::Privacy => Codicon::Shield,
            Self::System => Codicon::Cpu,
            Self::Updates => Codicon::Refresh,
            Self::About => Codicon::Info,
        }
    }
}

impl fmt::Display for SettingsCategoryId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for SettingsCategoryId {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::from_str(s).ok_or(())
    }
}

pub fn matches_settings_query(query: &str, haystack: &str) -> bool {
    let normalized_query = query.trim().to_lowercase();
    if normalized_query.is_empty() {
        return true;
    }
    let normalized_haystack = haystack.to_lowercase();
    normalized_query
        .split_whitespace()
        .all(|token| normalized_haystack.contains(token))
}
