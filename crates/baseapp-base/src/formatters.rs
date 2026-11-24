use std::fmt;
use std::str::FromStr;

use chrono::{DateTime, Datelike, FixedOffset, Local, NaiveDate, Timelike, Utc};
use serde::{Deserialize, Serialize};

use crate::number::js_round;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub enum DateFormat {
    #[default]
    #[serde(rename = "dmy")]
    Dmy,
    #[serde(rename = "mdy")]
    Mdy,
    #[serde(rename = "ymd")]
    Ymd,
    #[serde(rename = "locale")]
    Locale,
}

impl DateFormat {
    pub const ALL: &'static [Self] = &[Self::Dmy, Self::Mdy, Self::Ymd, Self::Locale];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Dmy => "dmy",
            Self::Mdy => "mdy",
            Self::Ymd => "ymd",
            Self::Locale => "locale",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "dmy" => Some(Self::Dmy),
            "mdy" => Some(Self::Mdy),
            "ymd" => Some(Self::Ymd),
            "locale" => Some(Self::Locale),
            _ => None,
        }
    }
}

impl fmt::Display for DateFormat {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for DateFormat {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::parse(s).ok_or(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub enum TimeFormat {
    #[default]
    #[serde(rename = "24-hour")]
    Hour24,
    #[serde(rename = "12-hour")]
    Hour12,
}

impl TimeFormat {
    pub const ALL: &'static [Self] = &[Self::Hour24, Self::Hour12];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Hour24 => "24-hour",
            Self::Hour12 => "12-hour",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "24-hour" => Some(Self::Hour24),
            "12-hour" => Some(Self::Hour12),
            _ => None,
        }
    }
}

impl fmt::Display for TimeFormat {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for TimeFormat {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::parse(s).ok_or(())
    }
}

fn parse_iso_timestamp(iso: &str) -> Option<DateTime<FixedOffset>> {
    if iso.is_empty() {
        return None;
    }
    if let Ok(parsed) = DateTime::parse_from_rfc3339(iso) {
        return Some(parsed);
    }
    if let Ok(date) = NaiveDate::parse_from_str(iso, "%Y-%m-%d")
        && let Some(naive_dt) = date.and_hms_opt(0, 0, 0)
    {
        return Some(naive_dt.and_utc().fixed_offset());
    }
    None
}

fn format_locale_calendar_date(year: i32, month: u32, day: u32, locale: &str) -> String {
    let normalized = locale.trim().to_ascii_lowercase();
    let language = normalized.split(['-', '_']).next().unwrap_or("en");
    match language {
        "de" | "tr" | "ru" => format!("{day:02}.{month:02}.{year:04}"),
        "fr" | "es" | "pt" => format!("{day:02}/{month:02}/{year:04}"),
        "zh" | "ja" => format!("{year:04}/{month:02}/{day:02}"),
        "ko" => format!("{year:04}. {month:02}. {day:02}."),
        "en" if normalized == "en-gb" || normalized == "en_gb" => {
            format!("{day:02}/{month:02}/{year:04}")
        }
        _ => format!("{month:02}/{day:02}/{year:04}"),
    }
}

fn format_calendar_date(
    year: i32,
    month: u32,
    day: u32,
    date_format: DateFormat,
    locale: &str,
) -> String {
    match date_format {
        DateFormat::Dmy => format!("{day:02}.{month:02}.{year:04}"),
        DateFormat::Mdy => format!("{month:02}/{day:02}/{year:04}"),
        DateFormat::Ymd => format!("{year:04}-{month:02}-{day:02}"),
        DateFormat::Locale => format_locale_calendar_date(year, month, day, locale),
    }
}

struct DateTimeParts {
    year: i32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
}

fn format_parts(
    parts: DateTimeParts,
    time_format: TimeFormat,
    date_format: DateFormat,
    locale: &str,
) -> String {
    let calendar = format_calendar_date(parts.year, parts.month, parts.day, date_format, locale);
    match time_format {
        TimeFormat::Hour12 => {
            let period = if parts.hour >= 12 { "PM" } else { "AM" };
            let hour_12 = match parts.hour % 12 {
                0 => 12,
                other => other,
            };
            format!("{calendar} {hour_12:02}:{:02} {period}", parts.minute)
        }
        TimeFormat::Hour24 => format!("{calendar} {:02}:{:02}", parts.hour, parts.minute),
    }
}

pub fn format_date(
    iso: &str,
    time_format: TimeFormat,
    date_format: DateFormat,
    locale: &str,
) -> String {
    let Some(parsed) = parse_iso_timestamp(iso) else {
        return String::new();
    };
    let local = parsed.with_timezone(&Local);
    format_parts(
        DateTimeParts {
            year: local.year(),
            month: local.month(),
            day: local.day(),
            hour: local.hour(),
            minute: local.minute(),
        },
        time_format,
        date_format,
        locale,
    )
}

pub fn format_date_utc(
    iso: &str,
    time_format: TimeFormat,
    date_format: DateFormat,
    locale: &str,
) -> String {
    let Some(parsed) = parse_iso_timestamp(iso) else {
        return String::new();
    };
    let utc = parsed.with_timezone(&Utc);
    format_parts(
        DateTimeParts {
            year: utc.year(),
            month: utc.month(),
            day: utc.day(),
            hour: utc.hour(),
            minute: utc.minute(),
        },
        time_format,
        date_format,
        locale,
    )
}

const BYTE_UNITS: [&str; 4] = ["B", "KB", "MB", "GB"];

fn format_one_decimal(value: f64) -> String {
    let rounded = js_round(value * 10.0) / 10.0;
    let normalized = if rounded == 0.0 { 0.0 } else { rounded };
    let formatted = format!("{normalized:.1}");
    match formatted.strip_suffix(".0") {
        Some(whole) => whole.to_string(),
        None => formatted,
    }
}

pub fn format_bytes(bytes: f64) -> String {
    if !bytes.is_finite() || bytes <= 0.0 {
        return String::from("0 B");
    }
    let raw_exponent = (bytes.log2() / 10.0).floor();
    let max_index = (BYTE_UNITS.len() - 1) as i32;
    let exponent = if raw_exponent >= f64::from(max_index) {
        max_index
    } else if raw_exponent <= f64::from(i32::MIN) {
        i32::MIN
    } else {
        raw_exponent as i32
    };
    let unit = usize::try_from(exponent)
        .ok()
        .and_then(|idx| BYTE_UNITS.get(idx).copied())
        .unwrap_or("B");
    if exponent == 0 {
        return format!("{:.0} {unit}", js_round(bytes));
    }
    let value = bytes / 1024.0_f64.powi(exponent);
    if value >= 100.0 {
        format!("{:.0} {unit}", js_round(value))
    } else {
        format!("{} {unit}", format_one_decimal(value))
    }
}

#[cfg(test)]
mod tests {
    use super::{DateFormat, TimeFormat, format_bytes, format_date, format_date_utc};

    #[test]
    fn serde_round_trips_date_and_time_formats() {
        for format in DateFormat::ALL {
            let json = serde_json::to_string(format).unwrap();
            let parsed: DateFormat = serde_json::from_str(&json).unwrap();
            assert_eq!(parsed, *format);
        }
        assert_eq!(serde_json::to_string(&DateFormat::Dmy).unwrap(), "\"dmy\"");
        assert_eq!(serde_json::to_string(&DateFormat::Mdy).unwrap(), "\"mdy\"");
        assert_eq!(serde_json::to_string(&DateFormat::Ymd).unwrap(), "\"ymd\"");
        assert_eq!(
            serde_json::to_string(&DateFormat::Locale).unwrap(),
            "\"locale\""
        );

        for format in TimeFormat::ALL {
            let json = serde_json::to_string(format).unwrap();
            let parsed: TimeFormat = serde_json::from_str(&json).unwrap();
            assert_eq!(parsed, *format);
        }
        assert_eq!(
            serde_json::to_string(&TimeFormat::Hour24).unwrap(),
            "\"24-hour\""
        );
        assert_eq!(
            serde_json::to_string(&TimeFormat::Hour12).unwrap(),
            "\"12-hour\""
        );
    }

    #[test]
    fn formats_utc_local_and_locale_dates() {
        assert_eq!(
            format_date_utc(
                "2026-03-05T00:05:00.000Z",
                TimeFormat::Hour12,
                DateFormat::Dmy,
                "en"
            ),
            "05.03.2026 12:05 AM"
        );
        assert_eq!(
            format_date_utc(
                "2026-03-05T18:45:00.000Z",
                TimeFormat::Hour12,
                DateFormat::Locale,
                "en-US"
            ),
            "03/05/2026 06:45 PM"
        );
        assert_eq!(
            format_date_utc(
                "2026-03-05T18:45:00.000Z",
                TimeFormat::Hour24,
                DateFormat::Locale,
                "tr"
            ),
            "05.03.2026 18:45"
        );
        assert_eq!(
            format_date("not-a-date", TimeFormat::Hour24, DateFormat::Dmy, "en"),
            ""
        );
        let local_formatted = format_date(
            "2026-03-05T12:00:00.000Z",
            TimeFormat::Hour24,
            DateFormat::Ymd,
            "en",
        );
        assert!(local_formatted.contains("2026-03-05"));
    }

    #[test]
    fn formats_bytes_across_scales() {
        assert_eq!(format_bytes(0.0), "0 B");
        assert_eq!(format_bytes(f64::NAN), "0 B");
        assert_eq!(format_bytes(0.4), "410 B");
        assert_eq!(format_bytes(0.6), "614 B");
        assert_eq!(format_bytes(1536.0), "1.5 KB");
        assert_eq!(format_bytes(1_625_292.8), "1.6 MB");
        assert_eq!(format_bytes(3_758_096_384.0), "3.5 GB");
        assert_eq!(format_bytes(2_748_779_069_440.0), "2560 GB");
    }
}
