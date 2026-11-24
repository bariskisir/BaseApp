use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::str::FromStr;

use baseapp_base::platform::DesktopPlatform;
use baseapp_platform::configuration::{
    AppConfiguration, AppConfigurationPatch, WINDOW_OPACITY_DEFAULT, WINDOW_OPACITY_MAX,
    WINDOW_OPACITY_MIN, WINDOW_OPACITY_STEP, filter_configuration_patch_for_platform,
    normalize_configuration_for_platform, parse_configuration_patch, parse_persisted_configuration,
};
use baseapp_platform::localization::{AppLocale, LocalizationService};
use baseapp_platform::product::default_product_info;
use baseapp_platform::security::ExternalUrlPolicy;
use baseapp_platform::sessions::{
    MAX_SESSION_TITLE_LENGTH, SessionDocument, SessionSummary, compare_session_summaries,
    to_session_summary, validate_session_id, validate_session_pin_value,
    validate_session_rename_title,
};
use baseapp_platform::theme::{ShellMetrics, THEME_COLOR_TOKENS, ThemePalette};
use baseapp_platform::update::{GitHubRelease, is_newer_version, select_windows_installer};
use baseapp_platform::window::{
    DEFAULT_WINDOW_HEIGHT, DEFAULT_WINDOW_WIDTH, DEFAULT_ZOOM_LEVEL, DisplayWorkArea,
    MAX_ZOOM_LEVEL, MIN_ZOOM_LEVEL, PersistedSidebarState, PersistedTertiaryBarState,
    PersistedWindowState, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_MIN_WORKSPACE,
    SidebarState, TERTIARY_DEFAULT_HEIGHT, TERTIARY_MIN_HEIGHT, TERTIARY_MIN_WORKSPACE,
    WindowBounds, ZOOM_LEVEL_STEP, clamp_sidebar_width, clamp_tertiary_bar_height,
    clamp_zoom_level, fit_window_bounds_to_displays, get_max_sidebar_width,
    get_max_tertiary_bar_height, parse_persisted_window_state, zoom_factor_to_zoom_level,
    zoom_level_to_zoom_factor,
};
use serde_json::Value;

fn fixture_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("rust")
        .join("fixtures")
        .join(name)
}

fn load_fixture(name: &str) -> Result<Value, String> {
    let raw = fs::read_to_string(fixture_path(name)).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

fn decode_f64(value: &Value) -> Result<f64, String> {
    if let Some(number) = value.as_f64() {
        return Ok(number);
    }
    match value.as_str() {
        Some("NaN") => Ok(f64::NAN),
        Some("Infinity") => Ok(f64::INFINITY),
        Some("-Infinity") => Ok(f64::NEG_INFINITY),
        other => Err(format!("unexpected float encoding: {other:?}")),
    }
}

fn flatten_json(
    prefix: &str,
    value: &Value,
    output: &mut BTreeMap<String, String>,
) -> Result<(), String> {
    match value {
        Value::Object(map) => {
            for (key, nested) in map {
                let next_prefix = if prefix.is_empty() {
                    key.clone()
                } else {
                    format!("{prefix}.{key}")
                };
                flatten_json(&next_prefix, nested, output)?;
            }
            Ok(())
        }
        Value::String(text) => {
            output.insert(prefix.to_string(), text.clone());
            Ok(())
        }
        other => Err(format!(
            "unexpected locale leaf value at {prefix}: {other:?}"
        )),
    }
}

#[test]
fn window_math_golden_parity() {
    let fixture = load_fixture("window_math_cases.json").unwrap();

    let constants = &fixture["constants"];
    assert_eq!(constants["minZoomLevel"].as_f64().unwrap(), MIN_ZOOM_LEVEL);
    assert_eq!(constants["maxZoomLevel"].as_f64().unwrap(), MAX_ZOOM_LEVEL);
    assert_eq!(
        constants["defaultZoomLevel"].as_f64().unwrap(),
        DEFAULT_ZOOM_LEVEL
    );
    assert_eq!(
        constants["zoomLevelStep"].as_f64().unwrap(),
        ZOOM_LEVEL_STEP
    );
    assert_eq!(
        constants["defaultWindowSize"]["width"].as_i64().unwrap(),
        i64::from(DEFAULT_WINDOW_WIDTH)
    );
    assert_eq!(
        constants["defaultWindowSize"]["height"].as_i64().unwrap(),
        i64::from(DEFAULT_WINDOW_HEIGHT)
    );
    assert_eq!(
        constants["sidebarLimits"]["min"].as_f64().unwrap(),
        SIDEBAR_MIN_WIDTH
    );
    assert_eq!(
        constants["sidebarLimits"]["default"].as_f64().unwrap(),
        SIDEBAR_DEFAULT_WIDTH
    );
    assert_eq!(
        constants["sidebarLimits"]["minWorkspace"].as_f64().unwrap(),
        SIDEBAR_MIN_WORKSPACE
    );
    assert_eq!(
        constants["tertiaryBarLimits"]["min"].as_f64().unwrap(),
        TERTIARY_MIN_HEIGHT
    );
    assert_eq!(
        constants["tertiaryBarLimits"]["default"].as_f64().unwrap(),
        TERTIARY_DEFAULT_HEIGHT
    );
    assert_eq!(
        constants["tertiaryBarLimits"]["minWorkspace"]
            .as_f64()
            .unwrap(),
        TERTIARY_MIN_WORKSPACE
    );

    let default_sidebar: SidebarState =
        serde_json::from_value(constants["defaultSidebarState"].clone()).unwrap();
    assert_eq!(SidebarState::default(), default_sidebar);
    let default_aux: PersistedSidebarState =
        serde_json::from_value(constants["defaultAuxiliaryBarState"].clone()).unwrap();
    assert_eq!(PersistedSidebarState::default_auxiliary(), default_aux);
    let default_tertiary: PersistedTertiaryBarState =
        serde_json::from_value(constants["defaultTertiaryBarState"].clone()).unwrap();
    assert_eq!(PersistedTertiaryBarState::default(), default_tertiary);

    let zoom_to_factor = fixture["zoomLevelToFactorCases"].as_array().unwrap();
    assert_eq!(zoom_to_factor.len(), 11);
    for case in zoom_to_factor {
        let level = decode_f64(&case["zoomLevel"]).unwrap();
        let expected = decode_f64(&case["expected"]).unwrap();
        let actual = zoom_level_to_zoom_factor(level);
        assert!(
            (actual - expected).abs() < 1e-12,
            "zoom_level_to_zoom_factor({level}): actual={actual} expected={expected}"
        );
    }

    let clamp_zoom = fixture["clampZoomLevelCases"].as_array().unwrap();
    assert_eq!(clamp_zoom.len(), 18);
    for case in clamp_zoom {
        let level = decode_f64(&case["level"]).unwrap();
        let expected = decode_f64(&case["expected"]).unwrap();
        let actual = clamp_zoom_level(level);
        assert_eq!(
            actual, expected,
            "clamp_zoom_level({level}): actual={actual} expected={expected}"
        );
    }

    let factor_to_level = fixture["zoomFactorToLevelCases"].as_array().unwrap();
    assert_eq!(factor_to_level.len(), 18);
    for case in factor_to_level {
        let factor = decode_f64(&case["zoomFactor"]).unwrap();
        let expected = decode_f64(&case["expected"]).unwrap();
        let actual = zoom_factor_to_zoom_level(factor);
        assert_eq!(
            actual, expected,
            "zoom_factor_to_zoom_level({factor}): actual={actual} expected={expected}"
        );
    }

    let max_sidebar = fixture["maxSidebarWidthCases"].as_array().unwrap();
    assert_eq!(max_sidebar.len(), 13);
    for case in max_sidebar {
        let viewport = decode_f64(&case["viewportWidth"]).unwrap();
        let other = decode_f64(&case["otherSidebarWidth"]).unwrap();
        let expected = decode_f64(&case["expected"]).unwrap();
        assert_eq!(get_max_sidebar_width(viewport, other), expected);
    }

    let clamp_sidebar = fixture["clampSidebarWidthCases"].as_array().unwrap();
    assert_eq!(clamp_sidebar.len(), 10);
    for case in clamp_sidebar {
        let width = decode_f64(&case["width"]).unwrap();
        let viewport = decode_f64(&case["viewportWidth"]).unwrap();
        let other = decode_f64(&case["otherSidebarWidth"]).unwrap();
        let expected = decode_f64(&case["expected"]).unwrap();
        assert_eq!(clamp_sidebar_width(width, viewport, other), expected);
    }

    let max_tertiary = fixture["maxTertiaryBarHeightCases"].as_array().unwrap();
    assert_eq!(max_tertiary.len(), 10);
    for case in max_tertiary {
        let viewport = decode_f64(&case["viewportHeight"]).unwrap();
        let expected = decode_f64(&case["expected"]).unwrap();
        assert_eq!(get_max_tertiary_bar_height(viewport), expected);
    }

    let clamp_tertiary = fixture["clampTertiaryBarHeightCases"].as_array().unwrap();
    assert_eq!(clamp_tertiary.len(), 9);
    for case in clamp_tertiary {
        let height = decode_f64(&case["height"]).unwrap();
        let viewport = decode_f64(&case["viewportHeight"]).unwrap();
        let expected = decode_f64(&case["expected"]).unwrap();
        assert_eq!(clamp_tertiary_bar_height(height, viewport), expected);
    }

    let fit_bounds = fixture["fitWindowBoundsCases"].as_array().unwrap();
    assert_eq!(fit_bounds.len(), 8);
    for case in fit_bounds {
        let name = case["name"].as_str().unwrap();
        let bounds: WindowBounds = serde_json::from_value(case["bounds"].clone()).unwrap();
        let work_areas: Vec<DisplayWorkArea> =
            serde_json::from_value(case["workAreas"].clone()).unwrap();
        let expected: Option<WindowBounds> =
            serde_json::from_value(case["expected"].clone()).unwrap();
        assert_eq!(
            fit_window_bounds_to_displays(&bounds, &work_areas),
            expected,
            "fitWindowBounds case failed: {name}"
        );
    }

    let parse_state = fixture["parsePersistedWindowStateCases"]
        .as_array()
        .unwrap();
    assert_eq!(parse_state.len(), 9);
    for case in parse_state {
        let name = case["name"].as_str().unwrap();
        let actual = parse_persisted_window_state(&case["input"]);
        let expected: Option<PersistedWindowState> =
            serde_json::from_value(case["expected"].clone()).unwrap();
        assert_eq!(
            actual, expected,
            "parsePersistedWindowState case failed: {name}"
        );
        if let Some(parsed) = actual {
            let reserialized = serde_json::to_value(&parsed).unwrap();
            assert_eq!(
                parse_persisted_window_state(&reserialized),
                Some(parsed),
                "round-trip failed: {name}"
            );
        }
    }
}

#[test]
fn configuration_golden_parity() {
    let fixture = load_fixture("config_cases.json").unwrap();

    let expected_default: AppConfiguration =
        serde_json::from_value(fixture["defaultConfiguration"].clone()).unwrap();
    assert_eq!(AppConfiguration::default(), expected_default);

    let limits = &fixture["limits"];
    assert_eq!(limits["zoomLevel"]["min"].as_f64().unwrap(), MIN_ZOOM_LEVEL);
    assert_eq!(limits["zoomLevel"]["max"].as_f64().unwrap(), MAX_ZOOM_LEVEL);
    assert_eq!(
        limits["zoomLevel"]["step"].as_f64().unwrap(),
        ZOOM_LEVEL_STEP
    );
    assert_eq!(
        limits["zoomLevel"]["default"].as_f64().unwrap(),
        DEFAULT_ZOOM_LEVEL
    );
    assert_eq!(
        limits["windowOpacity"]["min"].as_f64().unwrap(),
        WINDOW_OPACITY_MIN
    );
    assert_eq!(
        limits["windowOpacity"]["max"].as_f64().unwrap(),
        WINDOW_OPACITY_MAX
    );
    assert_eq!(
        limits["windowOpacity"]["step"].as_f64().unwrap(),
        WINDOW_OPACITY_STEP
    );
    assert_eq!(
        limits["windowOpacity"]["default"].as_f64().unwrap(),
        WINDOW_OPACITY_DEFAULT
    );

    let parse_cases = fixture["parsePersistedConfigCases"].as_array().unwrap();
    assert_eq!(parse_cases.len(), 15);
    for case in parse_cases {
        let name = case["name"].as_str().unwrap();
        let expected: AppConfiguration = serde_json::from_value(case["expected"].clone()).unwrap();
        let actual = parse_persisted_configuration(&case["input"]);
        assert_eq!(actual, expected, "parsePersistedConfig failed: {name}");
    }

    let normalize_cases = fixture["normalizeForPlatformCases"].as_array().unwrap();
    assert_eq!(normalize_cases.len(), 3);
    for case in normalize_cases {
        let platform = DesktopPlatform::from_str(case["platform"].as_str().unwrap()).unwrap();
        let input: AppConfiguration = serde_json::from_value(case["input"].clone()).unwrap();
        let expected: AppConfiguration = serde_json::from_value(case["expected"].clone()).unwrap();
        assert_eq!(
            normalize_configuration_for_platform(input, platform),
            expected,
            "normalizeForPlatform failed for {platform}"
        );
    }

    let filter_cases = fixture["filterPatchForPlatformCases"].as_array().unwrap();
    assert_eq!(filter_cases.len(), 3);
    for case in filter_cases {
        let platform = DesktopPlatform::from_str(case["platform"].as_str().unwrap()).unwrap();
        let input: AppConfigurationPatch = serde_json::from_value(case["input"].clone()).unwrap();
        let expected: AppConfigurationPatch =
            serde_json::from_value(case["expected"].clone()).unwrap();
        assert_eq!(
            filter_configuration_patch_for_platform(&input, platform),
            expected,
            "filterPatchForPlatform failed for {platform}"
        );
    }

    let patch_cases = fixture["patchSchemaCases"].as_array().unwrap();
    assert_eq!(patch_cases.len(), 13);
    for case in patch_cases {
        let name = case["name"].as_str().unwrap();
        let ok = case["ok"].as_bool().unwrap();
        let parsed = parse_configuration_patch(&case["input"]);
        if ok {
            let expected: AppConfigurationPatch =
                serde_json::from_value(case["data"].clone()).unwrap();
            assert_eq!(
                parsed.unwrap(),
                expected,
                "patchSchema valid failed: {name}"
            );
        } else {
            assert!(parsed.is_err(), "patchSchema should reject: {name}");
        }
    }
}

#[test]
fn sessions_golden_parity() {
    let fixture = load_fixture("sessions_cases.json").unwrap();
    assert_eq!(
        fixture["maxSessionTitleLength"].as_u64().unwrap() as usize,
        MAX_SESSION_TITLE_LENGTH
    );

    let doc: SessionDocument =
        serde_json::from_value(fixture["toSessionSummaryCase"]["input"].clone()).unwrap();
    let expected_summary: SessionSummary =
        serde_json::from_value(fixture["toSessionSummaryCase"]["expected"].clone()).unwrap();
    assert_eq!(to_session_summary(&doc), expected_summary);

    let compare_pairs = fixture["comparePairs"].as_array().unwrap();
    assert_eq!(compare_pairs.len(), 7);
    for case in compare_pairs {
        let name = case["name"].as_str().unwrap();
        let left: SessionSummary = serde_json::from_value(case["left"].clone()).unwrap();
        let right: SessionSummary = serde_json::from_value(case["right"].clone()).unwrap();
        let expected_ordering = match case["sign"].as_i64().unwrap() {
            -1 => Ordering::Less,
            0 => Ordering::Equal,
            1 => Ordering::Greater,
            other => panic!("unexpected sign {other}"),
        };
        assert_eq!(
            compare_session_summaries(&left, &right),
            expected_ordering,
            "comparePairs failed: {name}"
        );
    }

    let mut summaries: Vec<SessionSummary> =
        serde_json::from_value(fixture["sortOrderCase"]["input"].clone()).unwrap();
    summaries.sort_by(compare_session_summaries);
    let actual_ids: Vec<String> = summaries.into_iter().map(|summary| summary.id).collect();
    let expected_ids: Vec<String> =
        serde_json::from_value(fixture["sortOrderCase"]["expectedIds"].clone()).unwrap();
    assert_eq!(actual_ids, expected_ids);

    let id_cases = fixture["sessionIdCases"].as_array().unwrap();
    assert_eq!(id_cases.len(), 5);
    for case in id_cases {
        let ok = case["ok"].as_bool().unwrap();
        let result = case["input"]
            .as_str()
            .ok_or(())
            .and_then(|id| validate_session_id(id).map_err(|_| ()));
        assert_eq!(result.is_ok(), ok, "sessionIdCase failed: {case:?}");
    }

    let rename_cases = fixture["sessionRenameCases"].as_array().unwrap();
    assert_eq!(rename_cases.len(), 7);
    for case in rename_cases {
        let ok = case["ok"].as_bool().unwrap();
        let id_str = case["input"]["id"].as_str().unwrap();
        let title_str = case["input"]["title"].as_str().unwrap();
        let parsed = validate_session_id(id_str)
            .and_then(|id| validate_session_rename_title(title_str).map(|title| (id, title)));
        if ok {
            let (id, title) = parsed.unwrap();
            assert_eq!(id, case["data"]["id"].as_str().unwrap());
            assert_eq!(title, case["data"]["title"].as_str().unwrap());
        } else {
            assert!(parsed.is_err(), "sessionRenameCase should fail: {case:?}");
        }
    }

    let pin_cases = fixture["sessionPinCases"].as_array().unwrap();
    assert_eq!(pin_cases.len(), 4);
    for case in pin_cases {
        let ok = case["ok"].as_bool().unwrap();
        let parsed = validate_session_pin_value(&case["input"]);
        if ok {
            let (id, pinned) = parsed.unwrap();
            assert_eq!(id, case["data"]["id"].as_str().unwrap());
            assert_eq!(pinned, case["data"]["pinned"].as_bool().unwrap());
        } else {
            assert!(parsed.is_err(), "sessionPinCase should fail: {case:?}");
        }
    }
}

#[test]
fn security_golden_parity() {
    let fixture = load_fixture("security_cases.json").unwrap();
    let allowed_hosts: Vec<String> =
        serde_json::from_value(fixture["allowedHosts"].clone()).unwrap();
    assert_eq!(default_product_info().allowed_external_hosts, allowed_hosts);

    let policy = ExternalUrlPolicy::new(allowed_hosts);
    let cases = fixture["cases"].as_array().unwrap();
    assert_eq!(cases.len(), 21);

    for case in cases {
        let raw_url = case["url"].as_str().unwrap();
        let allowed = case["allowed"].as_bool().unwrap();
        assert_eq!(policy.is_allowed(raw_url), allowed, "url={raw_url}");
        let result = policy.assert_allowed(raw_url);
        if allowed {
            let normalized = result.unwrap().to_string();
            assert_eq!(
                normalized,
                case["normalizedUrl"].as_str().unwrap(),
                "normalized url mismatch for {raw_url}"
            );
        } else {
            let error = result.unwrap_err().to_string();
            assert_eq!(
                error,
                case["error"].as_str().unwrap(),
                "error mismatch for {raw_url}"
            );
        }
    }
}

#[test]
fn update_golden_parity() {
    let fixture = load_fixture("update_cases.json").unwrap();

    let version_cases = fixture["isNewerVersionCases"].as_array().unwrap();
    assert_eq!(version_cases.len(), 16);
    for case in version_cases {
        let candidate = case["candidate"].as_str().unwrap();
        let installed = case["installed"].as_str().unwrap();
        let ok = case["ok"].as_bool().unwrap();
        let result = is_newer_version(candidate, installed);
        if ok {
            assert_eq!(
                result.unwrap(),
                case["expected"].as_bool().unwrap(),
                "is_newer_version({candidate}, {installed})"
            );
        } else {
            assert_eq!(
                result.unwrap_err().to_string(),
                case["error"].as_str().unwrap(),
                "is_newer_version error({candidate}, {installed})"
            );
        }
    }

    let installer_cases = fixture["selectWindowsInstallerCases"].as_array().unwrap();
    assert_eq!(installer_cases.len(), 6);
    for case in installer_cases {
        let name = case["name"].as_str().unwrap();
        let release: GitHubRelease = serde_json::from_value(case["release"].clone()).unwrap();
        let arch = case["arch"].as_str().unwrap();
        let slug = case["slug"].as_str().unwrap();
        let ok = case["ok"].as_bool().unwrap();
        let result = select_windows_installer(&release, arch, slug);
        if ok {
            assert_eq!(
                result.unwrap().name,
                case["expectedAssetName"].as_str().unwrap(),
                "selectWindowsInstaller failed: {name}"
            );
        } else {
            assert_eq!(
                result.unwrap_err().to_string(),
                case["error"].as_str().unwrap(),
                "selectWindowsInstaller error failed: {name}"
            );
        }
    }
}

#[test]
fn theme_golden_parity() {
    let fixture = load_fixture("theme_snapshot.json").unwrap();
    let colors = fixture["colors"].as_array().unwrap();
    let sizes = fixture["sizes"].as_array().unwrap();

    assert_eq!(fixture["colorCount"].as_u64().unwrap() as usize, 101);
    assert_eq!(colors.len(), 101);
    assert_eq!(THEME_COLOR_TOKENS.len(), 101);

    let dark = ThemePalette::dark();
    let light = ThemePalette::light();

    for entry in colors {
        let id = entry["id"].as_str().unwrap();
        assert!(
            THEME_COLOR_TOKENS.contains(&id),
            "missing token in THEME_COLOR_TOKENS: {id}"
        );

        for (mode_name, palette) in [("dark", &dark), ("light", &light)] {
            let expected = &entry[mode_name];
            let actual = palette
                .color_by_token(id)
                .unwrap_or_else(|| panic!("missing {mode_name} color for token {id}"));

            assert_eq!(
                u64::from(actual.rgba.r),
                expected["rgba"]["r"].as_u64().unwrap(),
                "{mode_name}.{id}.r"
            );
            assert_eq!(
                u64::from(actual.rgba.g),
                expected["rgba"]["g"].as_u64().unwrap(),
                "{mode_name}.{id}.g"
            );
            assert_eq!(
                u64::from(actual.rgba.b),
                expected["rgba"]["b"].as_u64().unwrap(),
                "{mode_name}.{id}.b"
            );
            assert!(
                (actual.rgba.a - expected["rgba"]["a"].as_f64().unwrap()).abs() < 1e-9,
                "{mode_name}.{id}.a: actual={} expected={}",
                actual.rgba.a,
                expected["rgba"]["a"]
            );
            assert_eq!(
                actual.to_css(),
                expected["css"].as_str().unwrap(),
                "{mode_name}.{id}.css"
            );
            assert_eq!(
                actual.format_hex(),
                expected["hex"].as_str().unwrap(),
                "{mode_name}.{id}.hex"
            );
            assert_eq!(
                actual.format_hex_a(),
                expected["hexA"].as_str().unwrap(),
                "{mode_name}.{id}.hexA"
            );
        }
    }

    assert_eq!(fixture["sizeCount"].as_u64().unwrap() as usize, 12);
    assert_eq!(sizes.len(), 12);
    assert_eq!(ShellMetrics::SIZE_TOKENS.len(), 12);

    let metrics = ShellMetrics::default();
    for entry in sizes {
        let id = entry["id"].as_str().unwrap();
        let (actual_value, actual_unit) = metrics
            .size_by_token(id)
            .unwrap_or_else(|| panic!("missing size token {id}"));
        let expected_value = entry["dark"]["value"].as_f64().unwrap() as f32;
        let expected_unit = entry["dark"]["unit"].as_str().unwrap();
        let expected_css = entry["dark"]["css"].as_str().unwrap();
        assert_eq!(actual_value, expected_value, "size.{id}.value");
        assert_eq!(actual_unit, expected_unit, "size.{id}.unit");
        assert_eq!(
            format!("{actual_value}{actual_unit}"),
            expected_css,
            "size.{id}.css"
        );
    }
}

#[test]
fn locales_golden_parity() {
    let fixture = load_fixture("locales_snapshot.json").unwrap();
    let supported: Vec<String> =
        serde_json::from_value(fixture["supportedLocales"].clone()).unwrap();
    assert_eq!(supported.len(), 10);
    assert_eq!(AppLocale::ALL.len(), 10);
    assert_eq!(
        AppLocale::DEFAULT.as_str(),
        fixture["defaultLocale"].as_str().unwrap()
    );

    let service = LocalizationService::new();
    let expected_renderers = [
        (AppLocale::En, "Renderer"),
        (AppLocale::Tr, "İşleyici"),
        (AppLocale::De, "Grafik-Renderer"),
        (AppLocale::Fr, "Moteur de rendu"),
        (AppLocale::Pt, "Renderizador"),
        (AppLocale::Zh, "渲染器"),
        (AppLocale::Es, "Renderizador"),
        (AppLocale::Ru, "Рендерер"),
        (AppLocale::Ja, "レンダラー"),
        (AppLocale::Ko, "렌더러"),
    ];

    let forbidden_terms = ["vs code", "visual studio", "dark modern", "light modern"];
    let mut reference_keys: Option<Vec<String>> = None;

    for (code, (expected_locale, expected_renderer)) in supported.iter().zip(expected_renderers) {
        let locale = AppLocale::from_code(code).unwrap();
        assert_eq!(locale, expected_locale);

        let mut expected_leaves = BTreeMap::new();
        flatten_json("", &fixture["locales"][code], &mut expected_leaves).unwrap();
        assert_eq!(
            expected_leaves.len(),
            fixture["keyCounts"][code].as_u64().unwrap() as usize
        );

        for (key, expected_text) in &expected_leaves {
            assert_eq!(
                service.t(locale, key),
                *expected_text,
                "locale {code} mismatch at {key}"
            );
        }

        assert_eq!(service.t(locale, "settings.aboutRust"), "Rust");
        assert_eq!(service.t(locale, "settings.aboutGpui"), "GPUI");
        assert_eq!(
            service.t(locale, "settings.aboutRenderer"),
            expected_renderer
        );

        let tray = service.tray_menu(locale);
        assert_eq!(tray.open, fixture["locales"][code]["trayMenu"]["open"]);
        assert_eq!(
            tray.settings,
            fixture["locales"][code]["trayMenu"]["settings"]
        );
        assert_eq!(tray.exit, fixture["locales"][code]["trayMenu"]["exit"]);

        let all_keys = service.all_leaf_keys(locale);
        assert_eq!(all_keys.len(), 224);
        for key in &all_keys {
            let value_lower = service.t(locale, key).to_ascii_lowercase();
            for forbidden in forbidden_terms {
                assert!(
                    !value_lower.contains(forbidden),
                    "forbidden term '{forbidden}' found in {code}.{key}"
                );
            }
        }
        if let Some(expected_all) = &reference_keys {
            assert_eq!(&all_keys, expected_all, "key set mismatch for {code}");
        } else {
            reference_keys = Some(all_keys);
        }
    }

    assert_eq!(
        service.t_args(
            AppLocale::En,
            "statusBar.zoomLevel",
            &[("level", "+1"), ("percent", "120")]
        ),
        "Zoom Level: +1 (120%)"
    );
    assert_eq!(
        service.t_args(AppLocale::En, "statusBar.pinnedCount", &[("count", "3")]),
        "3 pinned"
    );
}
