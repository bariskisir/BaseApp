use std::collections::{BTreeMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;

use baseapp_ui::{
    BRAND_LOGO_ASSET_PATH, BRAND_LOGO_SVG_ASSET_PATH, BaseAppAssets, Codicon, brand_logo, codicon,
};
use gpui::{
    Application, AssetSource, AvailableSpace, Context, Image, ImageFormat, Render, SvgRenderer,
    TestAppContext, Window, div, point, prelude::*, px, rgb, size,
};

#[derive(Debug)]
enum JsonValue {
    String(String),
    Number(f64),
    Array(Vec<JsonValue>),
    Object(BTreeMap<String, JsonValue>),
}

struct JsonParser<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> JsonParser<'a> {
    fn new(input: &'a str) -> Self {
        Self {
            bytes: input.as_bytes(),
            pos: 0,
        }
    }

    fn parse(input: &'a str) -> Result<JsonValue, String> {
        let mut parser = Self::new(input);
        let value = parser.parse_value()?;
        parser.skip_whitespace();
        if parser.pos != parser.bytes.len() {
            return Err(format!("trailing bytes at {}", parser.pos));
        }
        Ok(value)
    }

    fn skip_whitespace(&mut self) {
        while let Some(&b) = self.bytes.get(self.pos) {
            if matches!(b, b' ' | b'\t' | b'\r' | b'\n') {
                self.pos += 1;
            } else {
                break;
            }
        }
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    fn expect_byte(&mut self, expected: u8) -> Result<(), String> {
        let actual = self.peek();
        if actual != Some(expected) {
            return Err(format!(
                "expected '{}' at byte {}, found {:?}",
                expected as char, self.pos, actual
            ));
        }
        self.pos += 1;
        Ok(())
    }

    fn parse_value(&mut self) -> Result<JsonValue, String> {
        self.skip_whitespace();
        match self.peek() {
            Some(b'"') => self.parse_string().map(JsonValue::String),
            Some(b'[') => self.parse_array().map(JsonValue::Array),
            Some(b'{') => self.parse_object().map(JsonValue::Object),
            Some(b'0'..=b'9' | b'-') => self.parse_number().map(JsonValue::Number),
            other => Err(format!("unexpected token {other:?} at byte {}", self.pos)),
        }
    }

    fn parse_string(&mut self) -> Result<String, String> {
        self.expect_byte(b'"')?;
        let mut out = String::new();
        while let Some(&b) = self.bytes.get(self.pos) {
            self.pos += 1;
            match b {
                b'"' => return Ok(out),
                b'\\' => {
                    let esc = *self
                        .bytes
                        .get(self.pos)
                        .ok_or_else(|| String::from("unterminated escape"))?;
                    self.pos += 1;
                    match esc {
                        b'"' => out.push('"'),
                        b'\\' => out.push('\\'),
                        b'/' => out.push('/'),
                        b'n' => out.push('\n'),
                        b'r' => out.push('\r'),
                        b't' => out.push('\t'),
                        b'u' => {
                            let hex_bytes = self
                                .bytes
                                .get(self.pos..self.pos + 4)
                                .ok_or_else(|| String::from("truncated unicode escape"))?;
                            let hex =
                                std::str::from_utf8(hex_bytes).map_err(|err| err.to_string())?;
                            self.pos += 4;
                            let code =
                                u32::from_str_radix(hex, 16).map_err(|err| err.to_string())?;
                            let ch = char::from_u32(code)
                                .ok_or_else(|| format!("invalid unicode scalar {code:#x}"))?;
                            out.push(ch);
                        }
                        other => return Err(format!("unsupported escape \\{}", other as char)),
                    }
                }
                other => out.push(other as char),
            }
        }
        Err(String::from("unterminated JSON string"))
    }

    fn parse_number(&mut self) -> Result<f64, String> {
        let start = self.pos;
        while let Some(b) = self.peek() {
            if matches!(b, b'0'..=b'9' | b'-' | b'+' | b'.' | b'e' | b'E') {
                self.pos += 1;
            } else {
                break;
            }
        }
        let slice =
            std::str::from_utf8(&self.bytes[start..self.pos]).map_err(|err| err.to_string())?;
        slice.parse::<f64>().map_err(|err| err.to_string())
    }

    fn parse_array(&mut self) -> Result<Vec<JsonValue>, String> {
        self.expect_byte(b'[')?;
        let mut items = Vec::new();
        self.skip_whitespace();
        if self.peek() == Some(b']') {
            self.pos += 1;
            return Ok(items);
        }
        loop {
            items.push(self.parse_value()?);
            self.skip_whitespace();
            match self.peek() {
                Some(b',') => self.pos += 1,
                Some(b']') => {
                    self.pos += 1;
                    return Ok(items);
                }
                other => return Err(format!("expected ',' or ']', found {other:?}")),
            }
        }
    }

    fn parse_object(&mut self) -> Result<BTreeMap<String, JsonValue>, String> {
        self.expect_byte(b'{')?;
        let mut map = BTreeMap::new();
        self.skip_whitespace();
        if self.peek() == Some(b'}') {
            self.pos += 1;
            return Ok(map);
        }
        loop {
            self.skip_whitespace();
            let key = self.parse_string()?;
            self.skip_whitespace();
            self.expect_byte(b':')?;
            let value = self.parse_value()?;
            map.insert(key, value);
            self.skip_whitespace();
            match self.peek() {
                Some(b',') => self.pos += 1,
                Some(b'}') => {
                    self.pos += 1;
                    return Ok(map);
                }
                other => return Err(format!("expected ',' or '}}', found {other:?}")),
            }
        }
    }
}

struct CodiconSnapshot {
    count: usize,
    names: Vec<String>,
    icons: BTreeMap<String, String>,
    brand_icon_svg: String,
}

fn load_codicon_snapshot() -> Result<CodiconSnapshot, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let fixture_path = manifest_dir
        .join("..")
        .join("..")
        .join("rust")
        .join("fixtures")
        .join("codicons_snapshot.json");
    let raw = std::fs::read_to_string(&fixture_path)
        .map_err(|err| format!("failed to read {}: {err}", fixture_path.display()))?;
    let JsonValue::Object(mut root) = JsonParser::parse(&raw)? else {
        return Err(String::from(
            "codicons_snapshot.json root must be an object",
        ));
    };
    let count = match root.remove("count") {
        Some(JsonValue::Number(n)) => n as usize,
        other => return Err(format!("expected numeric count, found {other:?}")),
    };
    let names = match root.remove("names") {
        Some(JsonValue::Array(items)) => items
            .into_iter()
            .map(|item| match item {
                JsonValue::String(s) => Ok(s),
                other => Err(format!("expected string icon name, found {other:?}")),
            })
            .collect::<Result<Vec<_>, _>>()?,
        other => return Err(format!("expected names array, found {other:?}")),
    };
    let icons = match root.remove("icons") {
        Some(JsonValue::Object(entries)) => entries
            .into_iter()
            .map(|(k, v)| match v {
                JsonValue::String(svg) => Ok((k, svg)),
                other => Err(format!("expected svg string for {k}, found {other:?}")),
            })
            .collect::<Result<BTreeMap<_, _>, _>>()?,
        other => return Err(format!("expected icons object, found {other:?}")),
    };
    let brand_icon_svg = match root.remove("brandIconSvg") {
        Some(JsonValue::String(s)) => s,
        other => return Err(format!("expected brandIconSvg string, found {other:?}")),
    };
    Ok(CodiconSnapshot {
        count,
        names,
        icons,
        brand_icon_svg,
    })
}

#[test]
fn codicons_match_snapshot_parity_exactly() {
    let snapshot = load_codicon_snapshot().expect("load codicon snapshot");
    assert_eq!(snapshot.count, 49);
    assert_eq!(snapshot.names.len(), 49);
    assert_eq!(snapshot.icons.len(), 49);
    assert_eq!(Codicon::ALL.len(), 49);

    let mut seen_variants = HashSet::new();
    let mut seen_paths = HashSet::new();
    let assets = BaseAppAssets;

    for (index, expected_name) in snapshot.names.iter().enumerate() {
        let parsed = Codicon::from_name(expected_name)
            .unwrap_or_else(|| panic!("Codicon::from_name missing {expected_name}"));
        assert_eq!(Codicon::ALL[index], parsed);
        assert_eq!(parsed.name(), expected_name);
        assert_eq!(parsed.asset_path(), format!("icons/{expected_name}.svg"));
        assert!(seen_variants.insert(parsed));
        assert!(seen_paths.insert(parsed.asset_path()));

        let loaded = assets
            .load(parsed.asset_path())
            .expect("asset load succeeds")
            .unwrap_or_else(|| panic!("missing embedded asset {}", parsed.asset_path()));
        assert!(!loaded.is_empty());

        let svg_text = std::str::from_utf8(&loaded).expect("valid utf8 svg");
        assert!(svg_text.contains("<svg"));
        assert!(svg_text.contains("</svg>"));

        let expected_svg = snapshot
            .icons
            .get(expected_name)
            .unwrap_or_else(|| panic!("missing snapshot svg for {expected_name}"));
        assert_eq!(svg_text.trim(), expected_svg.trim());
    }

    assert_eq!(
        Codicon::from_name("settings-gear"),
        Some(Codicon::SettingsGear)
    );
    assert_eq!(Codicon::from_name("unknown-icon"), None);
    assert_eq!(Codicon::from_name(""), None);
    assert!(
        assets
            .load("icons/does-not-exist.svg")
            .expect("ok")
            .is_none()
    );
}

#[test]
fn brand_assets_load_valid_png_and_svg() {
    let snapshot = load_codicon_snapshot().expect("load codicon snapshot");
    let assets = BaseAppAssets;

    let png_bytes = assets
        .load(BRAND_LOGO_ASSET_PATH)
        .expect("brand png load succeeds")
        .expect("brand png exists");
    assert!(png_bytes.len() > 8);
    assert_eq!(&png_bytes[..4], b"\x89PNG");
    assert_eq!(&png_bytes[..8], b"\x89PNG\r\n\x1a\n");

    let svg_bytes = assets
        .load(BRAND_LOGO_SVG_ASSET_PATH)
        .expect("brand svg load succeeds")
        .expect("brand svg exists");
    let svg_text = std::str::from_utf8(&svg_bytes).expect("valid utf8 brand svg");
    assert!(svg_text.contains("<svg"));
    assert!(svg_text.contains("</svg>"));
    assert_eq!(
        svg_text.replace("\r\n", "\n").trim(),
        snapshot.brand_icon_svg.replace("\r\n", "\n").trim()
    );
}

#[test]
fn asset_source_list_returns_expected_entries() {
    let assets = BaseAppAssets;

    let icons = assets.list("icons").expect("list icons succeeds");
    assert_eq!(icons.len(), 49);
    assert_eq!(
        assets.list("icons/").expect("list icons/ succeeds").len(),
        49
    );
    assert!(
        icons
            .iter()
            .any(|entry| entry.as_ref() == "icons/settings-gear.svg")
    );
    assert!(
        icons
            .iter()
            .any(|entry| entry.as_ref() == "icons/arrow-swap.svg")
    );

    let brand = assets.list("brand").expect("list brand succeeds");
    assert_eq!(brand.len(), 2);
    assert_eq!(brand[0].as_ref(), BRAND_LOGO_ASSET_PATH);
    assert_eq!(brand[1].as_ref(), BRAND_LOGO_SVG_ASSET_PATH);

    let all = assets.list("").expect("list root succeeds");
    assert_eq!(all.len(), 51);

    assert!(
        assets
            .list("icon")
            .expect("list non-boundary prefix")
            .is_empty()
    );
    assert!(assets.list("missing").expect("list missing").is_empty());
}

#[test]
fn gpui_svg_renderer_rasterizes_all_49_codicons() {
    let assets = Arc::new(BaseAppAssets);
    let renderer = SvgRenderer::new(assets.clone());

    for icon in Codicon::ALL {
        let bytes = assets
            .load(icon.asset_path())
            .expect("load succeeds")
            .expect("icon bytes exist");
        let image = renderer
            .render_single_frame(&bytes, 1.0)
            .unwrap_or_else(|err| panic!("failed to rasterize {}: {err}", icon.name()));
        assert_eq!(image.frame_count(), 1);
        let dimensions = image.size(0);
        assert!(i32::from(dimensions.width) > 0);
        assert!(i32::from(dimensions.height) > 0);
        let pixels = image.as_bytes(0).expect("rasterized pixel buffer exists");
        let has_opaque_pixel = pixels.as_chunks::<4>().0.iter().any(|bgra| bgra[3] > 0);
        assert!(
            has_opaque_pixel,
            "icon {} rasterized to fully transparent pixels",
            icon.name()
        );
    }
}

#[test]
fn baseapp_assets_decodes_brand_png_and_satisfies_application_with_assets() {
    let wire_into_app: fn(Application) -> Application = |app| app.with_assets(BaseAppAssets);
    let _ = wire_into_app;

    let assets = Arc::new(BaseAppAssets);
    let png_bytes = assets
        .load(BRAND_LOGO_ASSET_PATH)
        .expect("logo load ok")
        .expect("brand logo present");
    let renderer = SvgRenderer::new(assets);
    let render_image = Image::from_bytes(ImageFormat::Png, png_bytes.into_owned())
        .to_image_data(renderer)
        .expect("gpui decodes brand png");
    assert_eq!(render_image.frame_count(), 1);
    let dimensions = render_image.size(0);
    assert!(i32::from(dimensions.width) > 0);
    assert!(i32::from(dimensions.height) > 0);
    let pixels = render_image.as_bytes(0).expect("decoded pixels exist");
    assert!(pixels.as_chunks::<4>().0.iter().any(|bgra| bgra[3] > 0));
}

struct IconTestView;

impl Render for IconTestView {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        let mut container = div().flex().gap(px(4.0));
        for icon in Codicon::ALL {
            container = container.child(codicon(*icon, 16.0, rgb(0xCCCCCC)));
        }
        container.child(brand_logo(32.0))
    }
}

#[gpui::test]
fn renders_codicons_and_brand_logo_in_gpui_test_context(cx: &mut TestAppContext) {
    let (view, visual_cx) = cx.add_window_view(|_window, _cx| IconTestView);
    visual_cx.run_until_parked();
    visual_cx.draw(
        point(px(0.0), px(0.0)),
        size(
            AvailableSpace::Definite(px(960.0)),
            AvailableSpace::Definite(px(48.0)),
        ),
        |_window, _cx| {
            div()
                .flex()
                .child(codicon(Codicon::SettingsGear, 16.0, rgb(0xCCCCCC)))
                .child(codicon(Codicon::ZoomIn, 16.0, rgb(0xCCCCCC)))
                .child(view.clone())
        },
    );
    visual_cx.run_until_parked();
    let _ = cx.refresh();
}
