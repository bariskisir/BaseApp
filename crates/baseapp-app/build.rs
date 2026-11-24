use std::env;
use std::io;
use std::process::Command;

const GPUI_VERSION: &str = "0.3.14";

fn detect_rustc_version() -> String {
    let rustc = env::var("RUSTC").unwrap_or_else(|_| "rustc".to_string());
    let Ok(output) = Command::new(rustc).arg("--version").output() else {
        return "unknown".to_string();
    };
    if !output.status.success() {
        return "unknown".to_string();
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return "unknown".to_string();
    }
    let mut parts = trimmed.split_whitespace();
    match (parts.next(), parts.next()) {
        (Some("rustc"), Some(version)) => version.to_string(),
        _ => trimmed.to_string(),
    }
}

#[cfg(windows)]
fn parse_windows_version_number(version: &str) -> u64 {
    let mut parts = version.split('.');
    let major = parts
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(3);
    let minor = parts
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let patch = parts
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    (major << 48) | (minor << 32) | (patch << 16)
}

#[cfg(windows)]
fn embed_windows_resources() -> io::Result<()> {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return Ok(());
    }
    let version = env::var("CARGO_PKG_VERSION").unwrap_or_else(|_| "3.0.0".to_string());
    let packed_version = parse_windows_version_number(&version);
    let mut resource = winresource::WindowsResource::new();
    resource
        .set_icon("../../build/icon.ico")
        .set("ProductName", "BaseApp")
        .set("FileDescription", "BaseApp Desktop Application")
        .set("FileVersion", &version)
        .set("ProductVersion", &version)
        .set_version_info(winresource::VersionInfo::FILEVERSION, packed_version)
        .set_version_info(winresource::VersionInfo::PRODUCTVERSION, packed_version);
    resource.compile()
}

#[cfg(not(windows))]
fn embed_windows_resources() -> io::Result<()> {
    Ok(())
}

fn main() -> io::Result<()> {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=../../build/icon.ico");
    println!(
        "cargo:rustc-env=BASEAPP_RUSTC_VERSION={}",
        detect_rustc_version()
    );
    println!("cargo:rustc-env=BASEAPP_GPUI_VERSION={GPUI_VERSION}");
    embed_windows_resources()
}
