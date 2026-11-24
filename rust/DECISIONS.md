# Architecture Decision Records

## ADR-001: Pure Rust + GPUI Desktop Runtime
Status: accepted (2026-11-24)
Context: BaseApp 2.0.0 runs on Electron, Chromium, Node.js, Vite, and TypeScript. Rewriting BaseApp as a native Rust desktop application removes the Chromium/Node runtime overhead while preserving cross-platform GPU-accelerated rendering (DirectX 11 on Windows, Metal on macOS, Vulkan/Wayland/X11 on Linux) and headless UI testing. On crates.io, `gpui 0.2.2` lags behind current upstream GPUI (`windows 0.61`, older monolithic crate layout), whereas `gpui-pre = "=0.3.14"` + `gpui-pre-platform = "=0.3.14"` ship the split platform architecture, `windows 0.62`, AccessKit, improved Windows IME/HiDPI handling, and `#[gpui::test]` without cloning a large upstream git repository.
Decision: Standardize the workspace on `gpui = { package = "gpui-pre", version = "=0.3.14" }` and `gpui_platform = { package = "gpui-pre-platform", version = "=0.3.14" }` with Rust edition `2024` and Cargo resolver `2`.
Consequences: Fast builds from crates.io with clean package aliasing; migrating to stable `gpui 0.3+` later requires changing only the workspace dependency lines in root `Cargo.toml`.

## ADR-002: Custom Pure-GPUI Widget Library (`baseapp-ui`)
Status: accepted (2026-11-24)
Context: BaseApp follows a strict zero-third-party-UI-kit philosophy with an exact visual language: Dark (`#1F1F1F` workbench/editor, `#181818` chrome, `#2B2B2B` border, `#0078D4` accent) and Light (`#FFFFFF` workbench/editor, `#F8F8F8` chrome, `#E5E5E5` border, `#005FB8` accent) palettes, `35px` titlebar/tabs/sidebar header, `22px` statusbar, `200px` settings TOC, and 49 embedded 16x16 SVG Codicons (`settings-gear`, never `Settings2`).
Decision: Build BaseApp's own lightweight widget crate (`crates/baseapp-ui`) directly on GPUI primitives rather than adopting an external component framework (`gpui-component` / `gpui-kit`). Embed all 49 SVG Codicons and brand assets via `BaseAppAssets` implementing `gpui::AssetSource`.
Consequences: Full visual and behavioral parity with minimal external dependencies; every widget (`Button`, `InputBox`, `Checkbox`, `SelectBox`, `SegmentedControl`, `Slider`, `Sash`, `ActionBar`, `ContextMenuOverlay`, `DialogOverlay`, `ProgressBar`, `BaseAppTooltip`) is owned and unit-tested inside the repository.

## ADR-003: Version `3.0.0` and Native Runtime Metadata
Status: accepted (2026-11-24)
Context: Replacing Electron/TypeScript with a native Rust + GPUI desktop runtime is a major architectural milestone. The `About -> System & Runtime` section previously displayed Electron, Chromium, Node.js, and V8 versions, which no longer exist in the native binary.
Decision: Bump the workspace version to `3.0.0`. Update `About -> System & Runtime` (and all 10 locale dictionaries) to report native runtime details: `Version`, `Rust`, `GPUI`, `Renderer` (DirectX 11 / Metal / Vulkan), `OS`, and `License: MIT`, injecting build-time compiler/GPUI version strings via `crates/baseapp-app/build.rs`.
Consequences: Users see accurate native runtime telemetry in all 10 languages; release workflows validate `Cargo.toml` version `3.0.0` against git tags.

## ADR-004: Compile-Time 5-Crate Layered Workspace Architecture
Status: accepted (2026-11-24)
Context: BaseApp's legacy architecture enforced vertical boundaries (`base -> platform -> workbench -> code`) via static import lint tests. Cargo workspaces can enforce upward-only layering at compile time.
Decision: Partition the Rust codebase into five workspace crates with strictly acyclic, upward-only dependencies:
1. `crates/baseapp-base` (zero UI or OS-window dependencies)
2. `crates/baseapp-platform` (depends only on `baseapp-base`)
3. `crates/baseapp-ui` (depends only on `baseapp-platform` and `baseapp-base`)
4. `crates/baseapp-workbench` (depends on `baseapp-ui`, `baseapp-platform`, `baseapp-base`)
5. `crates/baseapp-app` (thin binary entrypoint depending on `baseapp-workbench`, `baseapp-platform`, `baseapp-base`)
Consequences: Upward imports become compile errors and are additionally verified by `crates/baseapp-app/tests/architecture_boundaries.rs`. Parallel wave workers own disjoint crate/file trees with zero merge conflicts.

## ADR-005: On-Disk Schema Compatibility & Record-Replay Golden Parity
Status: accepted (2026-11-24)
Context: Existing BaseApp users have persisted `config.json` (`settingsRevision: 1`, 21 settings, plus legacy `pageZoom` migration), `window-state.json` (`revision: 1`), and `sessions/<uuid>.json` files, along with deterministic business logic across zoom math, 3-sidebar clamping, multi-display bounds fitting, session sorting, URL allow-listing, update version/asset selection, theme tokens, 10 locales, and 49 SVG Codicons.
Decision: Preserve 100% camelCase JSON compatibility for all persisted files. Record ground-truth golden JSON fixtures directly from `old/src/app/` into `rust/fixtures/*.json` during Wave 0 and assert exact behavioral parity against those fixtures in unit/integration tests across `baseapp-base`, `baseapp-platform`, and `baseapp-ui`.
Consequences: Behavior regressions against BaseApp 2.0.0 are caught mechanically during `cargo test --workspace`; any intentional divergence requires a new superseding ADR.

## ADR-006: Zero-Comment Hygiene & Quality Gate Discipline
Status: accepted (2026-11-24)
Context: BaseApp maintains a strict zero-comment hygiene policy across source code, while `rust-anything` requires explicit `// SAFETY:` justification on any unavoidable `unsafe` block and forbids `unwrap`/`expect`/`panic!` in fallible functions.
Decision: Enforce zero comments (`//`, `/* */`, `///`) across all `.rs` source files in the workspace with one narrow exception: `// SAFETY:` comments immediately documenting unavoidable Win32 FFI `unsafe` blocks inside `crates/baseapp-platform/src/native/win32.rs`. Enforce workspace-wide `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, and zero external editor brand references or `Settings2` references.
Consequences: Clean, self-documenting Rust modules backed by automated architecture boundary tests; zero compiler warnings or unguarded panics in production paths.

## ADR-007: Reference Archive (`old/`) Retention Until User Cutover
Status: accepted (2026-11-24)
Context: Following the `rust-anything` whole-app cutover principle, the original implementation serves as the live oracle and reference throughout every rewrite wave and final verification.
Decision: Archive the Electron + TypeScript project (`src/`, `package.json`, `package-lock.json`, `tsconfig*.json`, Vite/Vitest/Biome/Prettier configs, `node_modules/`, `out/`) into `old/` while keeping shared root assets (`build/`, `images/`, `.github/`, `LICENSE`, `SECURITY.md`, `README.md`, `AGENTS.md`) at the repository root. Retain `old/` untouched until final verification succeeds and the user explicitly approves removing it.
Consequences: Every wave worker and verifier can inspect original behavior at any time without interfering with Cargo builds or git cleanliness (`old/node_modules`, `old/out`, `old/coverage` are gitignored).
