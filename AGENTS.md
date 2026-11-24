# Repository Guidelines

## Project Structure & Architecture

BaseApp `3.0.0` is a standalone native desktop application starter built in pure Rust (edition `2024`) and GPUI (`gpui-pre =0.3.14` + `gpui-pre-platform =0.3.14`), with zero third-party UI component frameworks, organized into a 5-crate layered Cargo workspace under `crates/`:

- `crates/baseapp-base/`: Zero-UI, zero-GPUI primitives (`color` RGBA/hex transforms, `number` clamp/snap math, `formatters` bytes and UTC/local date-time formatting, `platform` OS detection, and `fs` atomic temp-file writes + `FileOperationQueue`), plus golden-parity tests.
- `crates/baseapp-platform/`: Reusable desktop platform services with zero GPUI dependency (`product` identity constants & `ProductInfo`, `environment` OS data paths, `security` `ExternalUrlPolicy`, `window` exponential `1.2 ** zoomLevel` math + Primary/Secondary/Tertiary sidebar clamping with `170px`/`120px` minimums + multi-display bounds fitting, `configuration` 22-key camelCase settings + legacy migration + validation, `sessions` local workspace CRUD/sorting/repository, `state` `WindowStateStore`, `theme` 101 color tokens & 12 shell metrics for Dark `#1F1F1F`/`#181818`/`#0078D4` and Light `#FFFFFF`/`#F8F8F8`/`#005FB8`, `localization` 10 embedded locale JSONs, `log` daily rotating logger, `update` GitHub Release client with host/size/SHA-256 verification, and `native` dialogs, startup launch, `TrayManager`, and Win32 window effects).
- `crates/baseapp-ui/`: Custom pure-GPUI asset source and widget kit (`assets` `BaseAppAssets` serving 49 embedded 16x16 SVG Codicons + brand assets, `icon` `Codicon` enum + `codicon()`/`brand_logo()` helpers, `theme` `ActiveTheme` global + `scaled_rem_size` / `rem_px` helpers, and `widgets`: `Button`, `InputBox`, `Checkbox`, `SelectBox`, `SegmentedControl`, `Slider`, `Sash`, `ActionBar`, `ContextMenuOverlay`, `DialogOverlay`, `ProgressBar`, `BaseAppTooltip`).
- `crates/baseapp-workbench/`: Reactive GPUI workbench state and shell (`state`: `WorkbenchServices`, `WorkbenchState`, `WorkbenchEvent`, `LayoutState`, `ViewDescriptorState`, `NotificationStore`, `SettingsCategoryId`, and 18 `baseapp::*` GPUI actions/keybindings; `parts`: `WorkbenchView`, `TitlebarPart`, shared 3-sidebar shell hosting Primary/Secondary/bottom Tertiary sidebars with drag-and-drop and context-menu view relocation, `SessionsView`, `EditorPart` with `WelcomeView` and searchable 7-section `SettingsEditorView` including `200px` TOC and About System & Runtime view, `StatusbarPart` with prominent Zoom entry, and notification/startup overlays).
- `crates/baseapp-app/`: Thin native desktop binary (`build.rs` build-time rustc/GPUI env metadata and Windows icon/version resources without duplicating GPUI's manifest, `src/main.rs` single-instance lock, bounds restoration, Win32 window effects, `TrayManager` polling, and lifecycle hooks, plus `tests/architecture_boundaries.rs`).
- `build/`: Application icons (`.ico`, `.png`, `.svg`) and system tray icon presets.
- `rust/`: Rewrite architecture decisions (`DECISIONS.md`), domain glossary (`GLOSSARY.md`), wave tracker (`MAP.md`), and golden parity fixtures (`fixtures/*.json`).

## Crate Layer Rules & Safety Boundaries

Keep vertical crate layering and safety invariants strict (enforced both by Cargo and by `crates/baseapp-app/tests/architecture_boundaries.rs`):

- **Vertical dependencies:** `baseapp-base` -> `baseapp-platform` -> `baseapp-ui` -> `baseapp-workbench` -> `baseapp-app` only. Higher crates may depend on lower crates; never depend upward.
- **GPUI isolation:** Neither `baseapp-base` nor `baseapp-platform` may depend on `gpui` or `gpui_platform`.
- **Zero external UI kits:** Never depend on `gpui-component`, `gpui-kit`, or any third-party widget library. Build all UI widgets inside `crates/baseapp-ui/` directly on GPUI primitives.
- **Unsafe exclusivity:** Workspace lints enforce `unsafe_code = "deny"`. The sole permitted location for `unsafe` code is `crates/baseapp-platform/src/native/win32.rs` for direct Win32 User32 FFI calls, each paired with a `// SAFETY:` comment and `#[allow(unsafe_code)]`.
- **No unguarded panics in production:** Workspace Clippy lints warn (and CI denies via `-D warnings`) on `unwrap_used`, `expect_used`, `panic`, `todo`, and `unimplemented` across all non-test library, binary, and `build.rs` code (`clippy.toml` permits `unwrap`/`expect`/`panic` in test code only).
- **Theming & shell metrics:** Define color and metric tokens centrally in `crates/baseapp-platform/src/theme.rs` and consume them in GPUI views via `ActiveTheme` and `rem_px(...)` (`35px` titlebar/tabs/sidebar header, `22px` statusbar, `200px` settings TOC, `170px` / `120px` sidebar minimums).

## Build, Test, and Development Commands

- `cargo run --bin baseapp` builds and launches BaseApp locally in debug mode.
- `cargo build --release --bin baseapp` builds the optimized native release binary.
- `cargo fmt --all` formats the workspace; `cargo fmt --all -- --check` verifies formatting.
- `cargo clippy --workspace --all-targets -- -D warnings` runs strict lints across all crates, binaries, and tests.
- `cargo test --workspace` runs all unit, integration, golden-parity, architecture-boundary, and headless `#[gpui::test]` suites.

## Coding Style & Hygiene Policy

- **Zero-comment policy:** Do NOT write comments (`//`, `/* */`, `///`, `//!`) in any `.rs` file under `crates/**`, with one narrow exception: `// SAFETY:` comments immediately documenting unavoidable Win32 FFI `unsafe` blocks inside `crates/baseapp-platform/src/native/win32.rs`. Write self-explanatory identifiers and small, focused modules. Enforced automatically by `crates/baseapp-app/tests/architecture_boundaries.rs`.
- **Icons & naming:** Render UI icons using `Codicon` (`codicon(Codicon::SettingsGear, ...)` / `"settings-gear"`) from `baseapp-ui`. Never reference external editor brand names anywhere in `crates/`, `README.md`, `AGENTS.md`, `SECURITY.md`, or `.github/workflows/`.
- **JSON compatibility:** Keep persisted configuration (`config.json`), window state (`window-state.json`), and session documents (`sessions/<uuid>.json`) strictly camelCase-compatible with the recorded golden schemas in `rust/fixtures/`.

## Testing Guidelines

Write unit tests alongside modules and integration or headless GPUI tests under `crates/<crate>/tests/*.rs`:

- Use `tempfile::TempDir` for filesystem, persistence, session, configuration, and log tests so suites never touch user application data.
- Verify deterministic core and platform behavior against the golden fixtures in `rust/fixtures/*.json`.
- Test pure-GPUI widgets and workbench views headlessly using `#[gpui::test]` and `TestAppContext`.
- Run `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, and `cargo build --release --bin baseapp` before opening a PR.

## Commit & Pull Request Guidelines

Use concise imperative commit subjects with Conventional Commit scopes (e.g., `fix(platform): clamp offscreen window bounds`). Keep commits focused without unrelated churn. PRs should describe behavioral changes, verification performed, and security impact, with screenshots for UI changes.

## Security & Configuration

Preserve `ExternalUrlPolicy` allow-lists, trusted GitHub Release download host checks, asset size and SHA-256 verification, atomic file writes, strict configuration validation, and `unsafe_code = "deny"`. Keep credentials out of the repository and prefer runtime environment variables such as `APPLICATION_INSIGHTS_CONNECTION_STRING`. Review `SECURITY.md` before handling vulnerability reports.
