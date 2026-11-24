pub fn clamp(value: f64, min: f64, max: f64) -> f64 {
    if value.is_nan() || min.is_nan() || max.is_nan() {
        return f64::NAN;
    }
    value.max(min).min(max)
}

pub(crate) fn js_round(value: f64) -> f64 {
    if !value.is_finite() || value == 0.0 {
        return value;
    }
    let floor = value.floor();
    if value - floor >= 0.5 {
        let rounded = floor + 1.0;
        if rounded == 0.0 && value.is_sign_negative() {
            -0.0
        } else {
            rounded
        }
    } else {
        floor
    }
}

fn count_decimals(step: f64) -> usize {
    if !step.is_finite() {
        return 0;
    }
    let serialized = step.to_string();
    match serialized.find('.') {
        Some(index) => serialized.len().saturating_sub(index + 1).min(20),
        None => 0,
    }
}

pub fn snap_to_step(value: f64, min: f64, max: f64, step: f64) -> f64 {
    let clamped = clamp(value, min, max);
    if clamped.is_nan() || step.is_nan() || step == 0.0 {
        return f64::NAN;
    }
    let snapped = js_round((clamped - min) / step) * step + min;
    if !snapped.is_finite() {
        return clamp(snapped, min, max);
    }
    let normalized = if snapped == 0.0 { 0.0 } else { snapped };
    let precision = count_decimals(step);
    let formatted = format!("{normalized:.precision$}");
    let parsed = formatted.parse::<f64>().unwrap_or(normalized);
    clamp(parsed, min, max)
}

#[cfg(test)]
mod tests {
    use super::{clamp, js_round, snap_to_step};

    #[test]
    fn clamp_handles_bounds_and_non_finite_values() {
        assert_eq!(clamp(5.0, 0.0, 10.0), 5.0);
        assert_eq!(clamp(-3.0, 0.0, 10.0), 0.0);
        assert_eq!(clamp(15.0, 0.0, 10.0), 10.0);
        assert_eq!(clamp(f64::INFINITY, 0.0, 10.0), 10.0);
        assert_eq!(clamp(f64::NEG_INFINITY, 0.0, 10.0), 0.0);
        assert!(clamp(f64::NAN, 0.0, 10.0).is_nan());
        assert!(clamp(5.0, f64::NAN, 10.0).is_nan());
        assert!(clamp(5.0, 0.0, f64::NAN).is_nan());
    }

    #[test]
    fn js_round_matches_ecmascript_half_toward_positive_infinity() {
        assert_eq!(js_round(0.499_999_999_999_999_94), 0.0);
        assert_eq!(js_round(0.5), 1.0);
        assert_eq!(js_round(1.5), 2.0);
        assert_eq!(js_round(-0.5), 0.0);
        assert_eq!(js_round(-1.5), -1.0);
        assert_eq!(js_round(-1.500_001), -2.0);
        assert!(js_round(f64::NAN).is_nan());
    }

    #[test]
    fn snap_to_step_handles_decimals_and_edge_cases() {
        assert_eq!(snap_to_step(0.34, 0.1, 1.0, 0.1), 0.3);
        assert_eq!(snap_to_step(0.35, 0.1, 1.0, 0.1), 0.3);
        assert_eq!(snap_to_step(0.36, 0.1, 1.0, 0.1), 0.4);
        assert_eq!(snap_to_step(0.75, 0.1, 1.0, 0.1), 0.8);
        assert_eq!(snap_to_step(-3.25, -10.0, 10.0, 0.5), -3.0);
        assert!(snap_to_step(f64::NAN, 0.1, 1.0, 0.1).is_nan());
        assert!(snap_to_step(0.5, 0.1, 1.0, 0.0).is_nan());
        assert_eq!(snap_to_step(f64::INFINITY, 0.1, 1.0, 0.1), 1.0);
        assert_eq!(snap_to_step(f64::NEG_INFINITY, 0.1, 1.0, 0.1), 0.1);
    }
}
