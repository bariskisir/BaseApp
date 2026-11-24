use std::collections::HashMap;
use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AppLocale {
    #[default]
    En,
    Tr,
    De,
    Fr,
    Pt,
    Zh,
    Es,
    Ru,
    Ja,
    Ko,
}

impl AppLocale {
    pub const ALL: &'static [Self] = &[
        Self::En,
        Self::Tr,
        Self::De,
        Self::Fr,
        Self::Pt,
        Self::Zh,
        Self::Es,
        Self::Ru,
        Self::Ja,
        Self::Ko,
    ];

    pub const DEFAULT: Self = Self::En;

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::En => "en",
            Self::Tr => "tr",
            Self::De => "de",
            Self::Fr => "fr",
            Self::Pt => "pt",
            Self::Zh => "zh",
            Self::Es => "es",
            Self::Ru => "ru",
            Self::Ja => "ja",
            Self::Ko => "ko",
        }
    }

    pub fn from_code(code: &str) -> Option<Self> {
        match code.trim().to_ascii_lowercase().as_str() {
            "en" => Some(Self::En),
            "tr" => Some(Self::Tr),
            "de" => Some(Self::De),
            "fr" => Some(Self::Fr),
            "pt" => Some(Self::Pt),
            "zh" => Some(Self::Zh),
            "es" => Some(Self::Es),
            "ru" => Some(Self::Ru),
            "ja" => Some(Self::Ja),
            "ko" => Some(Self::Ko),
            _ => None,
        }
    }

    const fn raw_json(self) -> &'static str {
        match self {
            Self::En => include_str!("../locales/en.json"),
            Self::Tr => include_str!("../locales/tr.json"),
            Self::De => include_str!("../locales/de.json"),
            Self::Fr => include_str!("../locales/fr.json"),
            Self::Pt => include_str!("../locales/pt.json"),
            Self::Zh => include_str!("../locales/zh.json"),
            Self::Es => include_str!("../locales/es.json"),
            Self::Ru => include_str!("../locales/ru.json"),
            Self::Ja => include_str!("../locales/ja.json"),
            Self::Ko => include_str!("../locales/ko.json"),
        }
    }
}

impl fmt::Display for AppLocale {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for AppLocale {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "en" => Ok(Self::En),
            "tr" => Ok(Self::Tr),
            "de" => Ok(Self::De),
            "fr" => Ok(Self::Fr),
            "pt" => Ok(Self::Pt),
            "zh" => Ok(Self::Zh),
            "es" => Ok(Self::Es),
            "ru" => Ok(Self::Ru),
            "ja" => Ok(Self::Ja),
            "ko" => Ok(Self::Ko),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TrayMenuLabels {
    pub open: String,
    pub settings: String,
    pub exit: String,
}

fn flatten_json_object(prefix: &str, value: &Value, output: &mut HashMap<String, String>) {
    match value {
        Value::Object(map) => {
            for (key, nested) in map {
                let full_key = if prefix.is_empty() {
                    key.clone()
                } else {
                    format!("{prefix}.{key}")
                };
                flatten_json_object(&full_key, nested, output);
            }
        }
        Value::String(text) if !prefix.is_empty() => {
            output.insert(prefix.to_string(), text.clone());
        }
        _ => {}
    }
}

fn load_locale_map(locale: AppLocale) -> HashMap<String, String> {
    let mut map = HashMap::new();
    if let Ok(value) = serde_json::from_str::<Value>(locale.raw_json()) {
        flatten_json_object("", &value, &mut map);
    }
    map
}

#[derive(Debug, Clone)]
pub struct LocalizationService {
    dictionaries: HashMap<AppLocale, HashMap<String, String>>,
}

impl LocalizationService {
    pub fn new() -> Self {
        let mut dictionaries = HashMap::with_capacity(AppLocale::ALL.len());
        for &locale in AppLocale::ALL {
            dictionaries.insert(locale, load_locale_map(locale));
        }
        Self { dictionaries }
    }

    pub fn t(&self, locale: AppLocale, key: &str) -> String {
        if let Some(value) = self
            .dictionaries
            .get(&locale)
            .and_then(|dictionary| dictionary.get(key))
        {
            return value.clone();
        }
        if locale != AppLocale::DEFAULT
            && let Some(value) = self
                .dictionaries
                .get(&AppLocale::DEFAULT)
                .and_then(|dictionary| dictionary.get(key))
        {
            return value.clone();
        }
        key.to_string()
    }

    pub fn t_args(&self, locale: AppLocale, key: &str, args: &[(&str, &str)]) -> String {
        let mut rendered = self.t(locale, key);
        for (name, replacement) in args {
            let double_brace = format!("{{{{{name}}}}}");
            if rendered.contains(&double_brace) {
                rendered = rendered.replace(&double_brace, replacement);
            }
            let single_brace = format!("{{{name}}}");
            if rendered.contains(&single_brace) {
                rendered = rendered.replace(&single_brace, replacement);
            }
        }
        rendered
    }

    pub fn tray_menu(&self, locale: AppLocale) -> TrayMenuLabels {
        TrayMenuLabels {
            open: self.t(locale, "trayMenu.open"),
            settings: self.t(locale, "trayMenu.settings"),
            exit: self.t(locale, "trayMenu.exit"),
        }
    }

    pub fn all_leaf_keys(&self, locale: AppLocale) -> Vec<String> {
        let mut keys: Vec<String> = self
            .dictionaries
            .get(&locale)
            .map(|dictionary| dictionary.keys().cloned().collect())
            .unwrap_or_default();
        keys.sort();
        keys
    }
}

impl Default for LocalizationService {
    fn default() -> Self {
        Self::new()
    }
}
