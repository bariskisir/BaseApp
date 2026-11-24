# BaseApp Rust + GPUI Rewrite Map

## Goal

Rewrite BaseApp `2.0.0` (Electron + TypeScript, archived in `old/`) into BaseApp `3.0.0`, a standalone pure Rust + GPUI native desktop application with full feature parity, on-disk JSON compatibility, golden parity verification, headless `#[gpui::test]` coverage, and native desktop polish.

## ADR Index

See [DECISIONS.md](DECISIONS.md):
- `ADR-001`: Pure Rust + GPUI (`gpui-pre 0.3.14` + `gpui-pre-platform 0.3.14`) desktop runtime
- `ADR-002`: Custom pure-GPUI widget library (`baseapp-ui`) with 49 embedded SVG Codicons
- `ADR-003`: Version `3.0.0` and native Rust + GPUI runtime metadata
- `ADR-004`: Compile-time 5-crate layered Cargo workspace (`base` -> `platform` -> `ui` -> `workbench` -> `app`)
- `ADR-005`: On-disk JSON compatibility and `old/` golden parity fixtures (`rust/fixtures/*.json`)
- `ADR-006`: Zero-comment hygiene (except `// SAFETY:` in Win32 FFI) and strict Cargo gates
- `ADR-007`: Retain `old/` archive until final verification and user cutover approval

Terminology reference: [GLOSSARY.md](GLOSSARY.md).

## Wave & Unit Tracker

| Wave | Unit ID | Owner Role | Target Files | Golden Fixtures / Proof | State |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Wave 0** | `wave0-scaffold` | `rust-scaffolder` | `old/` archive, `.gitignore`, `Cargo.toml`, `rustfmt.toml`, `rust/{DECISIONS,GLOSSARY,MAP}.md`, `rust/fixtures/*.json`, 5 crate skeletons | 11 golden JSON fixtures recorded from `old/`, workspace `fmt` + `check` + `clippy -D warnings` + `test` green | `done` |
| **Wave 1** | `base-core` | `base-core` | `crates/baseapp-base/**` | `color_cases.json`, `number_cases.json`, `formatters_cases.json`, atomic file & queue tests | `done` |
| **Wave 1** | `platform-data` | `platform-data` | `crates/baseapp-platform/src/{product,environment,security,window,configuration,sessions,update,log}.rs` | `window_math_cases.json`, `config_cases.json`, `sessions_cases.json`, `security_cases.json`, `update_cases.json`, repository/log/HTTP unit tests | `done` |
| **Wave 1** | `platform-l10n-theme` | `platform-l10n-theme` | `crates/baseapp-platform/src/{theme.rs,localization/**,native/**}` | `theme_snapshot.json`, `locales_snapshot.json`, 10-locale parity & interpolation, native host/tray/startup/Win32 tests | `done` |
| **Wave 2** | `ui-kit` | `ui-icons-assets` | `crates/baseapp-ui/**` | `codicons_snapshot.json`, 49 SVG Codicons via `AssetSource`, `ActiveTheme`, all 12 pure-GPUI widgets + `#[gpui::test]` suites | `done` |
| **Wave 2** | `workbench-core` | `workbench-core` | `crates/baseapp-workbench/src/{lib.rs,state/**}` | `WorkbenchState`, 3-sidebar `ViewDescriptorState`, 18 commands/shortcuts + unit & `#[gpui::test]` suites | `done` |
| **Wave 3** | `settings-views` | `ui-icons-assets` | `crates/baseapp-workbench/src/parts/settings/**` | Searchable settings editor, 200px TOC, modified indicators, 7 category views (`General`..`About`) + `#[gpui::test]` | `done` |
| **Wave 3** | `workbench-shell` | `workbench-core` | `crates/baseapp-workbench/src/parts/{titlebar,sidebar,sessions_view,editor,welcome_view,statusbar,notifications,workbench}.rs` | Drag-and-drop 3-sidebar views, sash resize, sessions CRUD/pin/search, zoom, statusbar, overlays + `#[gpui::test]` | `done` |
| **Wave 3** | `app-packaging` | `app-packaging` | `crates/baseapp-app/**`, `.github/workflows/**`, `README.md`, `AGENTS.md`, `rust/MAP.md` | `build.rs`, `main.rs`, `tests/architecture_boundaries.rs`, CI/release workflows, updated docs | `done` |
| **Wave 4** | `final-verification` | `verifier` | Read-only audit + live binary launch | `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `cargo build --release --bin baseapp`, live UI visual verification | `open` |

## Out of Scope

- Removing `old/` before explicit user approval (`ADR-007`).
- External third-party GPUI component frameworks (`ADR-002`).
- Electron IPC or browser preload layers (replaced by direct in-process Rust service calls).
