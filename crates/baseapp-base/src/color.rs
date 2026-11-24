use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::number::{clamp, js_round};

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum ColorError {
    #[error("Invalid hex color: {0}")]
    InvalidHex(String),
}

fn round_float(value: f64, decimal_points: i32) -> f64 {
    let scale = 10.0_f64.powi(decimal_points);
    let rounded = js_round(value * scale) / scale;
    if rounded == 0.0 { 0.0 } else { rounded }
}

fn clamp_unit(value: f64) -> f64 {
    if value.is_nan() {
        0.0
    } else {
        clamp(value, 0.0, 1.0)
    }
}

fn clamp_byte(value: f64) -> u8 {
    if value.is_nan() {
        0
    } else {
        clamp(js_round(value), 0.0, 255.0) as u8
    }
}

fn normalize_alpha(alpha: f64) -> f64 {
    round_float(clamp_unit(alpha), 3)
}

fn format_alpha(alpha: f64) -> String {
    let normalized = if alpha == 0.0 { 0.0 } else { alpha };
    format!("{normalized}")
}

struct HslaChannels {
    h: f64,
    s: f64,
    l: f64,
    a: f64,
}

fn rgba_to_hsla(rgba: Rgba) -> HslaChannels {
    let r = f64::from(rgba.r) / 255.0;
    let g = f64::from(rgba.g) / 255.0;
    let b = f64::from(rgba.b) / 255.0;
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;
    let delta = max - min;

    let mut h = 0.0;
    let mut s = 0.0;

    if delta > 0.0 {
        s = clamp_unit(if l <= 0.5 {
            delta / (2.0 * l)
        } else {
            delta / (2.0 - 2.0 * l)
        });
        if (max - r).abs() <= f64::EPSILON {
            h = (g - b) / delta + if g < b { 6.0 } else { 0.0 };
        } else if (max - g).abs() <= f64::EPSILON {
            h = (b - r) / delta + 2.0;
        } else {
            h = (r - g) / delta + 4.0;
        }
        h = js_round(h * 60.0);
    }

    HslaChannels { h, s, l, a: rgba.a }
}

fn hue_to_rgb(p: f64, q: f64, t: f64) -> f64 {
    let mut normalized = t;
    if normalized < 0.0 {
        normalized += 1.0;
    }
    if normalized > 1.0 {
        normalized -= 1.0;
    }
    if normalized < 1.0 / 6.0 {
        return p + (q - p) * 6.0 * normalized;
    }
    if normalized < 0.5 {
        return q;
    }
    if normalized < 2.0 / 3.0 {
        return p + (q - p) * (2.0 / 3.0 - normalized) * 6.0;
    }
    p
}

fn hsla_to_rgba(hsla: HslaChannels) -> Rgba {
    let h = hsla.h / 360.0;
    let s = clamp_unit(hsla.s);
    let l = clamp_unit(hsla.l);

    if s == 0.0 {
        let channel = js_round(l * 255.0);
        return Rgba::from_floats(channel, channel, channel, hsla.a);
    }

    let q = if l < 0.5 {
        l * (1.0 + s)
    } else {
        l + s - l * s
    };
    let p = 2.0 * l - q;
    let r = js_round(hue_to_rgb(p, q, h + 1.0 / 3.0) * 255.0);
    let g = js_round(hue_to_rgb(p, q, h) * 255.0);
    let b = js_round(hue_to_rgb(p, q, h - 1.0 / 3.0) * 255.0);

    Rgba::from_floats(r, g, b, hsla.a)
}

fn parse_hex_nibble(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn parse_hex_byte(high: u8, low: u8) -> Option<u8> {
    Some((parse_hex_nibble(high)? << 4) | parse_hex_nibble(low)?)
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Rgba {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: f64,
}

impl Rgba {
    pub fn new(r: u8, g: u8, b: u8, a: f64) -> Self {
        Self {
            r,
            g,
            b,
            a: normalize_alpha(a),
        }
    }

    pub const fn rgb(r: u8, g: u8, b: u8) -> Self {
        Self { r, g, b, a: 1.0 }
    }

    pub fn from_floats(r: f64, g: f64, b: f64, a: f64) -> Self {
        Self {
            r: clamp_byte(r),
            g: clamp_byte(g),
            b: clamp_byte(b),
            a: normalize_alpha(a),
        }
    }

    pub fn alpha_u8(self) -> u8 {
        clamp_byte(clamp_unit(self.a) * 255.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Color {
    pub rgba: Rgba,
}

impl Color {
    pub const WHITE: Self = Self {
        rgba: Rgba::rgb(255, 255, 255),
    };
    pub const BLACK: Self = Self {
        rgba: Rgba::rgb(0, 0, 0),
    };
    pub const TRANSPARENT: Self = Self {
        rgba: Rgba {
            r: 0,
            g: 0,
            b: 0,
            a: 0.0,
        },
    };

    pub fn new(rgba: Rgba) -> Self {
        Self {
            rgba: Rgba::new(rgba.r, rgba.g, rgba.b, rgba.a),
        }
    }

    pub const fn from_rgb(r: u8, g: u8, b: u8) -> Self {
        Self {
            rgba: Rgba::rgb(r, g, b),
        }
    }

    pub fn from_rgba(r: u8, g: u8, b: u8, a: f64) -> Self {
        Self {
            rgba: Rgba::new(r, g, b, a),
        }
    }

    pub fn from_hex(hex: &str) -> Result<Self, ColorError> {
        let trimmed = hex.trim();
        let normalized = trimmed.strip_prefix('#').unwrap_or(trimmed);
        let bytes = normalized.as_bytes();

        if bytes.is_empty() || !bytes.iter().all(u8::is_ascii_hexdigit) {
            return Err(ColorError::InvalidHex(hex.to_string()));
        }

        let invalid = || ColorError::InvalidHex(hex.to_string());

        match bytes {
            [r, g, b] => {
                let r = parse_hex_byte(*r, *r).ok_or_else(invalid)?;
                let g = parse_hex_byte(*g, *g).ok_or_else(invalid)?;
                let b = parse_hex_byte(*b, *b).ok_or_else(invalid)?;
                Ok(Self::from_rgba(r, g, b, 1.0))
            }
            [r, g, b, a] => {
                let r = parse_hex_byte(*r, *r).ok_or_else(invalid)?;
                let g = parse_hex_byte(*g, *g).ok_or_else(invalid)?;
                let b = parse_hex_byte(*b, *b).ok_or_else(invalid)?;
                let a = f64::from(parse_hex_byte(*a, *a).ok_or_else(invalid)?) / 255.0;
                Ok(Self::from_rgba(r, g, b, a))
            }
            [r1, r2, g1, g2, b1, b2] => {
                let r = parse_hex_byte(*r1, *r2).ok_or_else(invalid)?;
                let g = parse_hex_byte(*g1, *g2).ok_or_else(invalid)?;
                let b = parse_hex_byte(*b1, *b2).ok_or_else(invalid)?;
                Ok(Self::from_rgba(r, g, b, 1.0))
            }
            [r1, r2, g1, g2, b1, b2, a1, a2] => {
                let r = parse_hex_byte(*r1, *r2).ok_or_else(invalid)?;
                let g = parse_hex_byte(*g1, *g2).ok_or_else(invalid)?;
                let b = parse_hex_byte(*b1, *b2).ok_or_else(invalid)?;
                let a = f64::from(parse_hex_byte(*a1, *a2).ok_or_else(invalid)?) / 255.0;
                Ok(Self::from_rgba(r, g, b, a))
            }
            _ => Err(invalid()),
        }
    }

    pub fn format_hex(self) -> String {
        format!("#{:02x}{:02x}{:02x}", self.rgba.r, self.rgba.g, self.rgba.b)
    }

    pub fn format_hex_a(self) -> String {
        format!(
            "#{:02x}{:02x}{:02x}{:02x}",
            self.rgba.r,
            self.rgba.g,
            self.rgba.b,
            self.rgba.alpha_u8()
        )
    }

    pub fn to_css(self) -> String {
        self.to_string()
    }

    pub fn to_css_rgba(self) -> String {
        format!(
            "rgba({}, {}, {}, {})",
            self.rgba.r,
            self.rgba.g,
            self.rgba.b,
            format_alpha(self.rgba.a)
        )
    }

    pub fn transparent(self, factor: f64) -> Self {
        Self::from_rgba(self.rgba.r, self.rgba.g, self.rgba.b, self.rgba.a * factor)
    }

    pub fn with_alpha(self, alpha: f64) -> Self {
        Self::from_rgba(self.rgba.r, self.rgba.g, self.rgba.b, alpha)
    }

    pub fn opaque(self) -> Self {
        Self {
            rgba: Rgba {
                a: 1.0,
                ..self.rgba
            },
        }
    }

    pub fn lighten(self, factor: f64) -> Self {
        let hsla = rgba_to_hsla(self.rgba);
        let amount = clamp_unit(factor);
        let lightness = hsla.l + (1.0 - hsla.l) * amount;
        Self {
            rgba: hsla_to_rgba(HslaChannels {
                h: hsla.h,
                s: hsla.s,
                l: lightness,
                a: hsla.a,
            }),
        }
    }

    pub fn darken(self, factor: f64) -> Self {
        let hsla = rgba_to_hsla(self.rgba);
        let amount = clamp_unit(factor);
        let lightness = hsla.l * (1.0 - amount);
        Self {
            rgba: hsla_to_rgba(HslaChannels {
                h: hsla.h,
                s: hsla.s,
                l: lightness,
                a: hsla.a,
            }),
        }
    }

    pub fn mix(self, other: Self, weight: f64) -> Self {
        let factor = clamp_unit(weight);
        let r =
            f64::from(self.rgba.r) + (f64::from(other.rgba.r) - f64::from(self.rgba.r)) * factor;
        let g =
            f64::from(self.rgba.g) + (f64::from(other.rgba.g) - f64::from(self.rgba.g)) * factor;
        let b =
            f64::from(self.rgba.b) + (f64::from(other.rgba.b) - f64::from(self.rgba.b)) * factor;
        let a = self.rgba.a + (other.rgba.a - self.rgba.a) * factor;
        Self {
            rgba: Rgba::from_floats(r, g, b, a),
        }
    }

    pub const fn to_u32_rgb(self) -> u32 {
        ((self.rgba.r as u32) << 16) | ((self.rgba.g as u32) << 8) | (self.rgba.b as u32)
    }

    pub fn to_u32_rgba(self) -> u32 {
        ((self.rgba.r as u32) << 24)
            | ((self.rgba.g as u32) << 16)
            | ((self.rgba.b as u32) << 8)
            | u32::from(self.rgba.alpha_u8())
    }

    pub fn to_f32_rgba(self) -> [f32; 4] {
        [
            f32::from(self.rgba.r) / 255.0,
            f32::from(self.rgba.g) / 255.0,
            f32::from(self.rgba.b) / 255.0,
            clamp_unit(self.rgba.a) as f32,
        ]
    }
}

impl fmt::Display for Color {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if (self.rgba.a - 1.0).abs() < f64::EPSILON {
            write!(f, "{}", self.format_hex())
        } else {
            write!(f, "{}", self.to_css_rgba())
        }
    }
}

impl FromStr for Color {
    type Err = ColorError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::from_hex(s)
    }
}

#[cfg(test)]
mod tests {
    use super::{Color, ColorError, Rgba};

    #[test]
    fn parses_valid_hex_and_rejects_invalid_hex() {
        let accent = Color::from_hex("#0078D4").unwrap();
        assert_eq!(accent.rgba, Rgba::rgb(0, 120, 212));
        assert_eq!(accent.format_hex(), "#0078d4");
        assert_eq!(accent.format_hex_a(), "#0078d4ff");
        assert_eq!(accent.to_string(), "#0078d4");
        assert_eq!(accent.to_css_rgba(), "rgba(0, 120, 212, 1)");
        assert_eq!(accent.to_u32_rgb(), 0x0078d4);
        assert_eq!(accent.to_u32_rgba(), 0x0078d4ff);

        let short = Color::from_hex("0f8c").unwrap();
        assert_eq!(short.format_hex(), "#00ff88");
        assert_eq!(short.format_hex_a(), "#00ff88cc");
        assert_eq!(short.to_string(), "rgba(0, 255, 136, 0.8)");

        let err = Color::from_hex("#zzzzzz").unwrap_err();
        assert_eq!(err, ColorError::InvalidHex("#zzzzzz".to_string()));
        assert_eq!(err.to_string(), "Invalid hex color: #zzzzzz");
    }

    #[test]
    fn transforms_and_gpui_conversions_work() {
        let accent = Color::from_hex("#0078D4").unwrap();
        let half = accent.transparent(0.5);
        assert_eq!(half.to_string(), "rgba(0, 120, 212, 0.5)");
        assert_eq!(half.format_hex_a(), "#0078d480");
        assert_eq!(half.opaque(), accent);
        assert_eq!(accent.with_alpha(0.25).rgba.a, 0.25);

        assert_eq!(accent.lighten(0.2).format_hex(), "#1198ff");
        assert_eq!(accent.darken(0.2).format_hex(), "#0060aa");
        assert_eq!(Color::BLACK.mix(Color::WHITE, 0.5).format_hex(), "#808080");

        let f32_rgba = half.to_f32_rgba();
        assert_eq!(f32_rgba[0], 0.0);
        assert!((f32_rgba[1] - 120.0 / 255.0).abs() < 1e-6);
        assert!((f32_rgba[2] - 212.0 / 255.0).abs() < 1e-6);
        assert_eq!(f32_rgba[3], 0.5);
    }
}
