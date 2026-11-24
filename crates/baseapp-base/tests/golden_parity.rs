use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread;

use baseapp_base::{
    AtomicFileError, Color, DateFormat, DesktopPlatform, FileOperationQueue, Rgba, TimeFormat,
    clamp, current_platform, format_bytes, format_date_utc, is_startup_launch_supported,
    is_tray_supported, read_json_file, read_json_value, remove_interrupted_writes, snap_to_step,
    to_desktop_platform, write_json_file_atomic, write_text_file_atomic,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tempfile::tempdir;

fn fixture_path(file_name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../rust/fixtures")
        .join(file_name)
}

fn load_fixture<T: for<'de> Deserialize<'de>>(file_name: &str) -> Result<T, String> {
    let path = fixture_path(file_name);
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read fixture {}: {error}", path.display()))?;
    serde_json::from_str(&content)
        .map_err(|error| format!("failed to parse fixture {}: {error}", path.display()))
}

fn parse_js_number(value: &Value) -> Result<f64, String> {
    match value {
        Value::Number(num) => num
            .as_f64()
            .ok_or_else(|| format!("expected finite JSON number, got {num}")),
        Value::String(text) => match text.as_str() {
            "NaN" => Ok(f64::NAN),
            "Infinity" => Ok(f64::INFINITY),
            "-Infinity" => Ok(f64::NEG_INFINITY),
            other => Err(format!("unexpected string number token: {other}")),
        },
        other => Err(format!("unexpected JSON value for number: {other}")),
    }
}

fn assert_js_float_eq(actual: f64, expected: f64, context: &str) {
    if expected.is_nan() {
        assert!(actual.is_nan(), "{context}: expected NaN, got {actual}");
    } else if expected.is_infinite() {
        assert_eq!(
            actual.is_sign_positive(),
            expected.is_sign_positive(),
            "{context}: infinity sign mismatch (actual={actual}, expected={expected})"
        );
        assert!(
            actual.is_infinite(),
            "{context}: expected {expected}, got {actual}"
        );
    } else {
        assert!(
            (actual - expected).abs() <= 1e-12,
            "{context}: expected {expected}, got {actual}"
        );
    }
}

#[derive(Debug, Deserialize)]
struct FixtureRgba {
    r: u8,
    g: u8,
    b: u8,
    a: f64,
}

#[derive(Debug, Deserialize)]
struct FixtureFloatRgba {
    r: f64,
    g: f64,
    b: f64,
    a: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FromHexCase {
    input: String,
    ok: bool,
    rgba: Option<FixtureRgba>,
    to_string: Option<String>,
    hex: Option<String>,
    hex_a: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransformCase {
    op: String,
    hex: String,
    factor: Option<f64>,
    other_hex: Option<String>,
    weight: Option<f64>,
    rgba: FixtureRgba,
    to_string: String,
    hex_a: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RgbaClampCase {
    input: FixtureFloatRgba,
    rgba: FixtureRgba,
    to_string: String,
    hex: String,
    hex_a: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ColorCasesFixture {
    from_hex_cases: Vec<FromHexCase>,
    transform_cases: Vec<TransformCase>,
    rgba_clamp_cases: Vec<RgbaClampCase>,
}

#[derive(Debug, Deserialize)]
struct ClampCase {
    value: Value,
    min: Value,
    max: Value,
    expected: Value,
}

#[derive(Debug, Deserialize)]
struct SnapToStepCase {
    value: Value,
    min: Value,
    max: Value,
    step: Value,
    expected: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NumberCasesFixture {
    clamp_cases: Vec<ClampCase>,
    snap_to_step_cases: Vec<SnapToStepCase>,
}

#[derive(Debug, Deserialize)]
struct FormatBytesCase {
    input: Value,
    expected: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FormatDateCase {
    iso_date: String,
    date_format: DateFormat,
    time_format: TimeFormat,
    locale: String,
    expected: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FormattersCasesFixture {
    timezone: String,
    format_bytes_cases: Vec<FormatBytesCase>,
    format_date_cases: Vec<FormatDateCase>,
}

fn assert_color_matches(
    actual: Color,
    expected_rgba: &FixtureRgba,
    expected_to_string: &str,
    expected_hex: &str,
    expected_hex_a: &str,
    context: &str,
) {
    assert_eq!(actual.rgba.r, expected_rgba.r, "{context}: r mismatch");
    assert_eq!(actual.rgba.g, expected_rgba.g, "{context}: g mismatch");
    assert_eq!(actual.rgba.b, expected_rgba.b, "{context}: b mismatch");
    assert_js_float_eq(actual.rgba.a, expected_rgba.a, &format!("{context}: a"));
    assert_eq!(
        actual.to_string(),
        expected_to_string,
        "{context}: toString mismatch"
    );
    assert_eq!(actual.format_hex(), expected_hex, "{context}: hex mismatch");
    assert_eq!(
        actual.format_hex_a(),
        expected_hex_a,
        "{context}: hexA mismatch"
    );
}

#[test]
fn golden_parity_color_cases_all_52() -> Result<(), String> {
    let fixture: ColorCasesFixture = load_fixture("color_cases.json")?;
    assert_eq!(fixture.from_hex_cases.len(), 31);
    assert_eq!(fixture.transform_cases.len(), 15);
    assert_eq!(fixture.rgba_clamp_cases.len(), 6);

    for (index, case) in fixture.from_hex_cases.iter().enumerate() {
        let context = format!("fromHex[{index}] ({:?})", case.input);
        let result = Color::from_hex(&case.input);
        if case.ok {
            let color = result.map_err(|err| format!("{context}: unexpected err {err}"))?;
            let expected_rgba = case
                .rgba
                .as_ref()
                .ok_or_else(|| format!("{context}: missing rgba"))?;
            let expected_to_string = case
                .to_string
                .as_deref()
                .ok_or_else(|| format!("{context}: missing toString"))?;
            let expected_hex = case
                .hex
                .as_deref()
                .ok_or_else(|| format!("{context}: missing hex"))?;
            let expected_hex_a = case
                .hex_a
                .as_deref()
                .ok_or_else(|| format!("{context}: missing hexA"))?;
            assert_color_matches(
                color,
                expected_rgba,
                expected_to_string,
                expected_hex,
                expected_hex_a,
                &context,
            );
        } else {
            let err = result
                .err()
                .ok_or_else(|| format!("{context}: expected invalid hex error"))?;
            let expected_error = case
                .error
                .as_deref()
                .ok_or_else(|| format!("{context}: missing expected error"))?;
            assert_eq!(err.to_string(), expected_error, "{context}: error mismatch");
        }
    }

    let recorded_transform_inputs = [
        "#0078D4",
        "#53595D80",
        "#FFFFFF",
        "#FFFFFF",
        "#0078D4",
        "#1F1F1F",
        "#808080",
        "#0078D4",
        "#FFFFFF",
        "#2B2B2B",
        "#53595D80",
        "#1F1F1F",
        "#0078D4",
        "#1F1F1F",
        "#00000080",
    ];
    assert_eq!(
        recorded_transform_inputs.len(),
        fixture.transform_cases.len()
    );

    for (index, (case, input_hex)) in fixture
        .transform_cases
        .iter()
        .zip(recorded_transform_inputs.iter())
        .enumerate()
    {
        let context = format!("transform[{index}] ({} on {input_hex})", case.op);
        let base = Color::from_hex(input_hex).map_err(|err| err.to_string())?;
        let actual = match case.op.as_str() {
            "transparent" => base.transparent(
                case.factor
                    .ok_or_else(|| format!("{context}: missing factor"))?,
            ),
            "lighten" => base.lighten(
                case.factor
                    .ok_or_else(|| format!("{context}: missing factor"))?,
            ),
            "darken" => base.darken(
                case.factor
                    .ok_or_else(|| format!("{context}: missing factor"))?,
            ),
            "opaque" => base.opaque(),
            "mix" => {
                let other_hex = case
                    .other_hex
                    .as_deref()
                    .ok_or_else(|| format!("{context}: missing otherHex"))?;
                let other = Color::from_hex(other_hex).map_err(|err| err.to_string())?;
                let weight = case
                    .weight
                    .ok_or_else(|| format!("{context}: missing weight"))?;
                base.mix(other, weight)
            }
            other => return Err(format!("unexpected color transform op: {other}")),
        };
        assert_color_matches(
            actual,
            &case.rgba,
            &case.to_string,
            &case.hex,
            &case.hex_a,
            &context,
        );
    }

    for (index, case) in fixture.rgba_clamp_cases.iter().enumerate() {
        let context = format!("rgbaClamp[{index}]");
        let rgba = Rgba::from_floats(case.input.r, case.input.g, case.input.b, case.input.a);
        let color = Color::new(rgba);
        assert_color_matches(
            color,
            &case.rgba,
            &case.to_string,
            &case.hex,
            &case.hex_a,
            &context,
        );
    }
    Ok(())
}

#[test]
fn golden_parity_number_cases_all_36() -> Result<(), String> {
    let fixture: NumberCasesFixture = load_fixture("number_cases.json")?;
    assert_eq!(fixture.clamp_cases.len(), 16);
    assert_eq!(fixture.snap_to_step_cases.len(), 20);

    for (index, case) in fixture.clamp_cases.iter().enumerate() {
        let value = parse_js_number(&case.value)?;
        let min = parse_js_number(&case.min)?;
        let max = parse_js_number(&case.max)?;
        let expected = parse_js_number(&case.expected)?;
        let actual = clamp(value, min, max);
        assert_js_float_eq(
            actual,
            expected,
            &format!("clamp[{index}]({value}, {min}, {max})"),
        );
    }

    for (index, case) in fixture.snap_to_step_cases.iter().enumerate() {
        let value = parse_js_number(&case.value)?;
        let min = parse_js_number(&case.min)?;
        let max = parse_js_number(&case.max)?;
        let step = parse_js_number(&case.step)?;
        let expected = parse_js_number(&case.expected)?;
        let actual = snap_to_step(value, min, max, step);
        assert_js_float_eq(
            actual,
            expected,
            &format!("snap_to_step[{index}]({value}, {min}, {max}, {step})"),
        );
    }
    Ok(())
}

#[test]
fn golden_parity_formatters_cases_all_94() -> Result<(), String> {
    let fixture: FormattersCasesFixture = load_fixture("formatters_cases.json")?;
    assert_eq!(fixture.timezone, "UTC");
    assert_eq!(fixture.format_bytes_cases.len(), 28);
    assert_eq!(fixture.format_date_cases.len(), 66);

    for (index, case) in fixture.format_bytes_cases.iter().enumerate() {
        let input = parse_js_number(&case.input)?;
        let actual = format_bytes(input);
        assert_eq!(
            actual, case.expected,
            "formatBytes[{index}]({input}) mismatch"
        );
    }

    for (index, case) in fixture.format_date_cases.iter().enumerate() {
        let actual = format_date_utc(
            &case.iso_date,
            case.time_format,
            case.date_format,
            &case.locale,
        );
        assert_eq!(
            actual, case.expected,
            "formatDate[{index}]({:?}, {:?}, {:?}, {:?}) mismatch",
            case.iso_date, case.time_format, case.date_format, case.locale
        );
    }
    Ok(())
}

#[test]
fn platform_helpers_match_expected_capabilities() {
    assert_eq!(to_desktop_platform("win32"), DesktopPlatform::Win32);
    assert_eq!(to_desktop_platform("darwin"), DesktopPlatform::Darwin);
    assert_eq!(to_desktop_platform("linux"), DesktopPlatform::Linux);
    assert_eq!(to_desktop_platform("unknown"), DesktopPlatform::Linux);
    assert!(is_tray_supported(DesktopPlatform::Win32));
    assert!(is_tray_supported(DesktopPlatform::Darwin));
    assert!(!is_tray_supported(DesktopPlatform::Linux));
    assert!(is_startup_launch_supported(DesktopPlatform::Win32));
    assert!(is_startup_launch_supported(DesktopPlatform::Darwin));
    assert!(!is_startup_launch_supported(DesktopPlatform::Linux));
    assert!(DesktopPlatform::ALL.contains(&current_platform()));
}

#[derive(Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
struct CounterDoc {
    counter: u32,
}

#[test]
fn atomic_file_and_queue_preserve_concurrent_updates() {
    let dir = tempdir().unwrap();
    let target = Arc::new(dir.path().join("state").join("counter.json"));
    let queue = FileOperationQueue::new();

    assert_eq!(read_json_file::<CounterDoc>(&target).unwrap(), None);

    let mut handles = Vec::new();
    for _ in 0..8 {
        let q = queue.clone();
        let path = Arc::clone(&target);
        handles.push(thread::spawn(move || {
            for _ in 0..5 {
                q.enqueue_path(&path, || {
                    let mut doc: CounterDoc = read_json_file(&path).unwrap().unwrap_or_default();
                    doc.counter += 1;
                    write_json_file_atomic(&path, &doc).unwrap();
                });
            }
        }));
    }

    for handle in handles {
        handle.join().unwrap();
    }

    let final_doc: CounterDoc = read_json_file(&target).unwrap().unwrap();
    assert_eq!(final_doc.counter, 40);
    assert_eq!(queue.active_key_count(), 0);
    assert_eq!(
        remove_interrupted_writes(target.parent().unwrap()).unwrap(),
        0
    );

    let corrupt = dir.path().join("corrupt.json");
    write_text_file_atomic(&corrupt, "{bad").unwrap();
    assert!(matches!(
        read_json_value(&corrupt),
        Err(AtomicFileError::JsonParse { .. })
    ));
}
