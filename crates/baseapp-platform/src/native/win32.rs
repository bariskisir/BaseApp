use raw_window_handle::RawWindowHandle;

use crate::configuration::clamp_window_opacity;
use crate::native::NativeError;

#[cfg(target_os = "windows")]
mod imp {
    use std::ffi::c_void;

    use raw_window_handle::RawWindowHandle;
    use windows::Win32::Foundation::{COLORREF, HWND};
    use windows::Win32::UI::WindowsAndMessaging::{
        GWL_EXSTYLE, GetWindowLongW, HWND_NOTOPMOST, HWND_TOPMOST, IsWindowVisible, LWA_ALPHA,
        SW_HIDE, SW_SHOW, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
        SetLayeredWindowAttributes, SetWindowDisplayAffinity, SetWindowLongW, SetWindowPos,
        ShowWindow, WDA_EXCLUDEFROMCAPTURE, WDA_NONE, WS_EX_APPWINDOW, WS_EX_LAYERED,
        WS_EX_TOOLWINDOW,
    };

    use crate::configuration::clamp_window_opacity;
    use crate::native::NativeError;

    fn extract_hwnd(handle: RawWindowHandle) -> Result<HWND, NativeError> {
        match handle {
            RawWindowHandle::Win32(win32) => Ok(HWND(win32.hwnd.get() as *mut c_void)),
            _ => Err(NativeError::WindowHandleUnsupported),
        }
    }

    #[allow(unsafe_code)]
    pub fn apply_always_on_top(
        handle: RawWindowHandle,
        always_on_top: bool,
    ) -> Result<(), NativeError> {
        let hwnd = extract_hwnd(handle)?;
        let insert_after = if always_on_top {
            HWND_TOPMOST
        } else {
            HWND_NOTOPMOST
        };
        // SAFETY: `hwnd` is supplied by the caller's live Win32 window handle; `SetWindowPos` validates the HWND and updates only Z-order without moving, resizing, or activating the window.
        unsafe {
            SetWindowPos(
                hwnd,
                Some(insert_after),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            )
        }
        .map_err(|error| NativeError::Os(error.to_string()))
    }

    #[allow(unsafe_code)]
    pub fn apply_window_opacity(handle: RawWindowHandle, opacity: f64) -> Result<f64, NativeError> {
        let hwnd = extract_hwnd(handle)?;
        let clamped = clamp_window_opacity(opacity);
        let alpha = (clamped * 255.0).round().clamp(0.0, 255.0) as u8;
        let layered_bit = WS_EX_LAYERED.0 as i32;

        // SAFETY: `hwnd` is a Win32 window handle provided by the caller; `GetWindowLongW`, `SetWindowLongW`, and `SetLayeredWindowAttributes` are standard User32 calls that validate `hwnd` before modifying extended style bits and alpha.
        unsafe {
            let current_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
            if alpha == u8::MAX {
                if (current_style & layered_bit) != 0 {
                    SetLayeredWindowAttributes(hwnd, COLORREF(0), u8::MAX, LWA_ALPHA)
                        .map_err(|error| NativeError::Os(error.to_string()))?;
                    let _ = SetWindowLongW(hwnd, GWL_EXSTYLE, current_style & !layered_bit);
                }
            } else {
                if (current_style & layered_bit) == 0 {
                    let _ = SetWindowLongW(hwnd, GWL_EXSTYLE, current_style | layered_bit);
                }
                SetLayeredWindowAttributes(hwnd, COLORREF(0), alpha, LWA_ALPHA)
                    .map_err(|error| NativeError::Os(error.to_string()))?;
            }
        }
        Ok(clamped)
    }

    #[allow(unsafe_code)]
    pub fn apply_content_protection(
        handle: RawWindowHandle,
        enabled: bool,
    ) -> Result<(), NativeError> {
        let hwnd = extract_hwnd(handle)?;
        let affinity = if enabled {
            WDA_EXCLUDEFROMCAPTURE
        } else {
            WDA_NONE
        };
        // SAFETY: `hwnd` is a Win32 window handle provided by the caller; `SetWindowDisplayAffinity` validates the HWND and updates screen-capture affinity cleanly.
        unsafe { SetWindowDisplayAffinity(hwnd, affinity) }
            .map_err(|error| NativeError::Os(error.to_string()))
    }

    #[allow(unsafe_code)]
    pub fn apply_show_in_taskbar(handle: RawWindowHandle, show: bool) -> Result<(), NativeError> {
        let hwnd = extract_hwnd(handle)?;
        let tool_bit = WS_EX_TOOLWINDOW.0 as i32;
        let app_bit = WS_EX_APPWINDOW.0 as i32;

        // SAFETY: `hwnd` is a Win32 window handle provided by the caller; toggling `WS_EX_TOOLWINDOW` / `WS_EX_APPWINDOW` while temporarily hiding a visible window is the documented Win32 sequence for updating taskbar shell visibility.
        unsafe {
            let was_visible = IsWindowVisible(hwnd).as_bool();
            let current_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
            let next_style = if show {
                (current_style & !tool_bit) | app_bit
            } else {
                (current_style & !app_bit) | tool_bit
            };
            if next_style == current_style {
                return Ok(());
            }
            if was_visible {
                let _ = ShowWindow(hwnd, SW_HIDE);
            }
            let _ = SetWindowLongW(hwnd, GWL_EXSTYLE, next_style);
            SetWindowPos(
                hwnd,
                None,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            )
            .map_err(|error| NativeError::Os(error.to_string()))?;
            if was_visible {
                let _ = ShowWindow(hwnd, SW_SHOW);
            }
        }
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    use raw_window_handle::RawWindowHandle;

    use crate::configuration::clamp_window_opacity;
    use crate::native::NativeError;

    pub fn apply_always_on_top(
        _handle: RawWindowHandle,
        _always_on_top: bool,
    ) -> Result<(), NativeError> {
        Ok(())
    }

    pub fn apply_window_opacity(
        _handle: RawWindowHandle,
        opacity: f64,
    ) -> Result<f64, NativeError> {
        Ok(clamp_window_opacity(opacity))
    }

    pub fn apply_content_protection(
        _handle: RawWindowHandle,
        _enabled: bool,
    ) -> Result<(), NativeError> {
        Ok(())
    }

    pub fn apply_show_in_taskbar(_handle: RawWindowHandle, _show: bool) -> Result<(), NativeError> {
        Ok(())
    }
}

pub fn apply_always_on_top(
    handle: RawWindowHandle,
    always_on_top: bool,
) -> Result<(), NativeError> {
    imp::apply_always_on_top(handle, always_on_top)
}

pub fn apply_window_opacity(handle: RawWindowHandle, opacity: f64) -> Result<f64, NativeError> {
    let clamped = clamp_window_opacity(opacity);
    imp::apply_window_opacity(handle, clamped)
}

pub fn apply_content_protection(handle: RawWindowHandle, enabled: bool) -> Result<(), NativeError> {
    imp::apply_content_protection(handle, enabled)
}

pub fn apply_show_in_taskbar(handle: RawWindowHandle, show: bool) -> Result<(), NativeError> {
    imp::apply_show_in_taskbar(handle, show)
}
