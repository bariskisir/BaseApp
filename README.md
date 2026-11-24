<p align="center">
  <img src="build/icon.png" alt="BaseApp logo" width="88">
</p>

<h1 align="center">BaseApp</h1>

<p align="center">
  A fast, native Rust + GPUI desktop application starter built on a 5-crate layered workspace architecture.
</p>

<p align="center">
  <a href="https://github.com/bariskisir/BaseApp/actions/workflows/ci.yml"><img src="https://github.com/bariskisir/BaseApp/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://github.com/bariskisir/BaseApp/releases/latest"><img src="https://img.shields.io/github/v/release/bariskisir/BaseApp" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
</p>

<p align="center">
  <img src="images/1.png" alt="BaseApp interface" width="840">
  <img src="images/2.png" alt="BaseApp interface" width="840">
</p>

## Features

- **Pure Rust + GPUI native desktop shell**
  - Built in Rust (edition `2024`) with GPU-accelerated rendering via GPUI (`DirectX 11` on Windows, `Metal` on macOS, `Vulkan` over X11/Wayland on Linux) and zero third-party UI component frameworks.
  - Organized into a compile-time-enforced 5-crate Cargo workspace (`baseapp-base`, `baseapp-platform`, `baseapp-ui`, `baseapp-workbench`, `baseapp-app`) with a custom pure-GPUI widget library (`Button`, `InputBox`, `Checkbox`, `SelectBox`, `SegmentedControl`, `Slider`, `Sash`, `ActionBar`, `ContextMenuOverlay`, `DialogOverlay`, `ProgressBar`, `BaseAppTooltip`), 49 embedded 16x16 SVG Codicons via `BaseAppAssets`, and 101 semantic color tokens plus 12 shell size metrics.
  - Integrated desktop shell chrome: `35px` custom frameless `TitlebarPart` with layout and navigation controls, resizable Primary, Secondary, and bottom Tertiary sidebars with `Sash` resize handles, tabbed `EditorPart` (Welcome view and searchable Settings Editor with `200px` TOC, modified-setting indicators, hover reset, and runtime diagnostics About view), `22px` `StatusbarPart` with prominent Zoom indicator, floating notification toasts, and startup recovery overlay.
  - Single-instance locking prevents duplicate windows from colliding on local data.
  - Window bounds, maximized state, fullscreen state, Primary/Secondary/Tertiary sidebar geometry, and view locations are persisted in camelCase JSON and restored only when they fit a connected display.

- **Flexible Primary, Secondary, and Tertiary Side Bars with movable views**
  - Movable views (such as `Sessions`) register declaratively via `ViewDescriptorState` and relocate cleanly across the **Primary Side Bar**, **Secondary Side Bar**, and bottom **Tertiary Side Bar** via the header move menu, right-click context menu, empty-bar quick buttons, or drag-and-drop.
  - Primary Side Bar placement flips between **Left** and **Right** (automatically docking the Secondary Side Bar on the opposite edge while keeping the Tertiary Side Bar beneath the center editor).
  - Sidebars default to compact minimums (`170px` width for Primary/Secondary, `120px` height for Tertiary) and clamp cooperatively so the central editor always retains safe working dimensions.

- **Window zoom & keyboard shortcuts**
  - Exponential `1.2 ** zoomLevel` scaling (`-8` to `+8`, 20% per step) driven through GPUI `rem_size` and synchronized across Settings, keyboard shortcuts, and a prominent Status Bar zoom indicator with quick actions.
  - Built-in shortcuts: `Ctrl/Cmd+B` (Primary Side Bar), `Ctrl/Cmd+Alt+B` (Secondary Side Bar), `Ctrl/Cmd+J` (Tertiary Side Bar), `Ctrl/Cmd+,` (Settings), `Ctrl/Cmd+=` / `Ctrl/Cmd+-` / `Ctrl/Cmd+0` (Zoom In / Out / Reset), `F11` / `Ctrl+Cmd+F` (Full Screen), and `Escape` (dismiss overlays).

- **Generic session workspaces**
  - The movable `SessionsView` supports creating, selecting, searching, pinning, double-click and context-menu renaming, deleting, and confirmation-guarded deletion of all local workspaces.
  - Pinned sessions stay at the top and sort consistently by last-updated timestamp; the last active session is restored on startup.
  - Each session carries an extensible `data` map for downstream application models, and deletes are guarded so the final empty workspace cannot be removed while bulk or populated final deletions create a fresh replacement.
  - Settings, window state, and session writes are serialized through `FileOperationQueue` and atomic temp-file renames.

- **Compact mode**
  - Hides sidebars and top navigation controls for a distraction-free workspace, keeps an inline opacity slider accessible in the titlebar, and exits automatically when opening Settings.

- **General settings**
  - Full interface localization across 10 languages: English, Turkish, German, French, Portuguese, Chinese, Spanish, Russian, Japanese, and Korean.
  - Configurable calendar date formats (`DD.MM.YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD`, or locale default) and 12-hour or 24-hour clocks.
  - Launch at system startup on Windows and macOS (`StartupLaunchManager`).

- **Appearance & Window settings**
  - System, Light, and Dark themes backed by `ThemePalette` and `ActiveTheme` with Dark (`#1F1F1F` workbench/editor, `#181818` chrome, `#0078D4` accent) and Light (`#FFFFFF` workbench/editor, `#F8F8F8` chrome, `#005FB8` accent) palettes and live OS appearance tracking.
  - Primary Side Bar location (`left` or `right`), Status Bar visibility, window zoom level (`-8` to `+8`), live window opacity slider, always-on-top toggle, and one-click layout reset.

- **Tray & Taskbar settings**
  - Optional native system tray icon (`TrayManager` on Windows and macOS) with selectable icon presets, live-localized context menu, minimize-to-tray-on-close, start minimized, and taskbar visibility toggle with an accessibility warning when both are hidden.

- **Privacy & Data settings**
  - Screen-capture content protection (Win32 `SetWindowDisplayAffinity`), opt-in telemetry toggle (disabled by default), settings JSON backup export/import via native file dialogs (`rfd`), direct access to the local data folder, and confirmation-guarded factory reset.

- **System, Diagnostics & About**
  - Hardware acceleration toggle with restart indicator and one-click relaunch.
  - Daily log files (`baseapp-YYYY-MM-DD.log`) with runtime log-level filtering, live file count/size summary, folder shortcut, and one-click log cleanup.
  - About section with product identity banner, allow-listed external links (Author, Source Code, Releases, Report an Issue), and live native System & Runtime details (`Version`, `Rust`, `GPUI`, `Renderer`, `OS`, and `License`).

- **Updates**
  - Checks the latest stable GitHub Release automatically on startup (configurable) or manually from Settings, reporting checking, availability, progress, up-to-date status, and errors in both Settings and the Status Bar.
  - Enforces trusted GitHub download hosts, exact architecture matching, size checks, and SHA-256 verification when digests are provided.

- **Security & engineering hygiene**
  - Workspace-wide `unsafe_code = "deny"` (with `unsafe` restricted strictly to documented Win32 FFI calls in `crates/baseapp-platform/src/native/win32.rs`), zero `unwrap`/`expect`/`panic` in non-test production code, `ExternalUrlPolicy` host allow-listing, golden parity test suites, headless `#[gpui::test]` UI coverage, and automated crate-boundary/hygiene verification tests.

---

## Use BaseApp as a starter

Clone or template this repository, then customize these locations before shipping your own application:

1. Update product identity, repository URLs, and allowed external hosts in [`crates/baseapp-platform/src/product.rs`](crates/baseapp-platform/src/product.rs).
2. Update workspace metadata (`version`, `license`, `repository`, `authors`) in [`Cargo.toml`](Cargo.toml) and Windows version metadata in [`crates/baseapp-app/build.rs`](crates/baseapp-app/build.rs).
3. Replace the application icons in [`build/`](build/) and update screenshots in [`images/`](images/).
4. Customize localized copy across the 10 JSON dictionaries in [`crates/baseapp-platform/src/localization/locales/`](crates/baseapp-platform/src/localization/locales/).
5. Extend `SessionDocument::data`, `AppConfiguration`, `WorkbenchState`, movable sidebar views (`ViewDescriptorState`), and Settings sections (`crates/baseapp-workbench/src/parts/settings/`) for your domain features.
6. Build custom widgets directly on GPUI in [`crates/baseapp-ui/`](crates/baseapp-ui/) using `ActiveTheme` and `Codicon`.
7. Configure code signing, macOS notarization, and release channels before publishing production binaries.

Changing `APP_SLUG` or `APP_OWNER` changes the OS application-data directory used by new builds. Existing local data is not migrated automatically across renamed applications.

## Requirements

- Rust stable toolchain (`1.85+` / Rust edition `2024`) with `rustfmt` and `clippy`
- Windows, macOS, or Linux for local development
- On Linux, native desktop development headers (`pkg-config`, `libxkbcommon-dev`, `libxkbcommon-x11-dev`, `libxcb1-dev`, `libwayland-dev`, `libfontconfig1-dev`, `libfreetype-dev`, `libvulkan-dev`, `libxdo-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`)

## Development

```bash
git clone https://github.com/bariskisir/BaseApp.git
cd BaseApp
cargo run --bin baseapp
```

| Command | Purpose |
| --- | --- |
| `cargo run --bin baseapp` | Build and launch BaseApp in debug mode |
| `cargo build --release --bin baseapp` | Build the optimized native release binary |
| `cargo test --workspace` | Run unit, golden-parity, architecture-boundary, and headless `#[gpui::test]` suites |
| `cargo clippy --workspace --all-targets -- -D warnings` | Run strict Clippy lints across all crates and tests |
| `cargo fmt --all` | Format all Rust source files with `rustfmt` |
| `cargo fmt --all -- --check` | Verify formatting without modifying files |

Optional runtime environment variables for testing and automation:

- `BASEAPP_DATA_DIR`: override the local application-data directory (`config.json`, `window-state.json`, `sessions/`, `logs/`).
- `BASEAPP_ALLOW_MULTI_INSTANCE=1`: bypass the single-instance lock for parallel local launches.
- `BASEAPP_DISABLE_AUTO_UPDATE=1`: skip the automatic startup GitHub Release check.
- `BASEAPP_SMOKE_EXIT_MS=<ms>`: exit cleanly after `<ms>` milliseconds for automated smoke tests.

## Architecture

BaseApp enforces a strict 5-crate vertical dependency graph at compile time (`baseapp-base` -> `baseapp-platform` -> `baseapp-ui` -> `baseapp-workbench` -> `baseapp-app`):

```text
crates/
├── baseapp-base/       Zero-UI primitives: Color/Rgba, clamp/snap math, byte & date/time formatters,
│                       DesktopPlatform detection, atomic file I/O, and FileOperationQueue
├── baseapp-platform/   Desktop platform services (zero GPUI dependency): ProductInfo, EnvironmentPaths,
│                       ExternalUrlPolicy, window/zoom/sidebar geometry math, AppConfiguration persistence,
│                       SessionsService, WindowStateStore, ThemePalette (101 colors + 12 metrics),
│                       10-locale LocalizationService, LogService, GitHubReleaseClient, and native OS
│                       adapters (dialogs, startup launch, TrayManager, Win32 window effects)
├── baseapp-ui/         Pure-GPUI asset source and widget kit: BaseAppAssets (49 embedded SVG Codicons +
│                       brand assets), ActiveTheme & rem zoom helpers, and 12 reusable GPUI widgets
├── baseapp-workbench/  Reactive desktop workbench: WorkbenchState, ViewDescriptorState, LayoutState,
│                       NotificationStore, 18 GPUI actions/keybindings, and shell UI parts (Titlebar,
│                       3-Sidebar Shell, SessionsView, WelcomeView, EditorPart, 7-section SettingsEditor,
│                       Statusbar, Notifications & Startup overlays)
└── baseapp-app/        Thin native binary entrypoint (build.rs Windows resources & rustc/GPUI metadata,
                        single-instance lock, window bounds restoration, tray polling, Win32 effects,
                        and workspace architecture boundary tests)
```

- **Compile-time & test-enforced boundaries:** `crates/baseapp-app/tests/architecture_boundaries.rs` verifies upward-only crate layering, zero third-party UI kits, zero `unsafe` outside `crates/baseapp-platform/src/native/win32.rs`, zero-comment source hygiene (with the narrow `// SAFETY:` exception in `win32.rs`), and repository cleanliness.
- **On-disk compatibility:** Persisted `config.json`, `window-state.json`, and `sessions/<uuid>.json` preserve camelCase JSON schemas and are verified against recorded golden fixtures under [`rust/fixtures/`](rust/fixtures/).

## Release Packaging

Tagged `v*` pushes run `.github/workflows/release.yml`, which validates the git tag against the workspace version in [`Cargo.toml`](Cargo.toml), runs formatting/Clippy/tests, builds optimized binaries for Windows (`x86_64-pc-windows-msvc`), Linux (`x86_64-unknown-linux-gnu`), and macOS (`aarch64-apple-darwin`), packages `.zip` / `.tar.gz` archives with `SHA256SUMS.txt`, and publishes a GitHub Release. Production distributions should add platform code signing and macOS notarization.

## Security

BaseApp enforces `unsafe_code = "deny"` workspace-wide (restricting `unsafe` strictly to audited Win32 API calls), strict `ExternalUrlPolicy` allow-lists for external links, trusted host + SHA-256 verification for release updates, and atomic file persistence with schema validation. See [SECURITY.md](SECURITY.md) for private vulnerability reporting guidance.

## License

[MIT](LICENSE)
