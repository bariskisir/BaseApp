# TypeScript-to-Rust Domain Glossary

This glossary maps BaseApp 2.0.0 (`old/src/app/`) domain types, services, and UI concepts to their canonical Rust + GPUI names so every wave uses consistent terminology.

## Crate Layer Mapping

| Legacy Layer (`old/src/app/`) | Rust Workspace Crate | Responsibility |
| :--- | :--- | :--- |
| `base/common/*`, `base/node/*` | `crates/baseapp-base` | Zero-UI primitives (color, number, formatters, platform, atomic file I/O, operation queue) |
| `platform/*` | `crates/baseapp-platform` | Product metadata, paths, URL security, window math/state, configuration, sessions, theme tokens, 10 locales, logging, GitHub updates, OS native host/tray/startup/dialogs/Win32 |
| `base/browser/*`, `base/browser/ui/*` | `crates/baseapp-ui` | Pure GPUI widget library, `BaseAppAssets` (`AssetSource`), 49 embedded SVG `Codicon`s, `ActiveTheme` GPUI global |
| `workbench/*` | `crates/baseapp-workbench` | `WorkbenchState`, `ViewDescriptorService`, commands/keybindings, `TitlebarPart`, 3-sidebar `SidebarPartView`, `SessionsView`, `EditorPart`, `WelcomeEditorView`, `SettingsEditorView` + 7 category views, `StatusbarPart`, `NotificationsOverlay`, `WorkbenchView` |
| `code/*` | `crates/baseapp-app` | Thin desktop binary (`baseapp`), single-instance lock, GPUI bootstrap, `build.rs` icon/metadata embedding, architecture boundary tests |

## Domain Types & Functions

| Legacy TypeScript Symbol | Rust Type / Function | Crate & Module |
| :--- | :--- | :--- |
| `RGBA`, `Color` | `Rgba`, `HexColor` / `Color` | `baseapp-base::color` |
| `clamp`, `snapToStep` | `clamp`, `snap_to_step` | `baseapp-base::number` |
| `DateFormat`, `TimeFormat`, `formatDate`, `formatBytes` | `DateFormat`, `TimeFormat`, `format_date`, `format_date_utc`, `format_bytes` | `baseapp-base::formatters` |
| `DesktopPlatform`, `toDesktopPlatform`, `isTraySupported`, `isStartupLaunchSupported` | `DesktopPlatform`, `to_desktop_platform`, `is_tray_supported`, `is_startup_launch_supported` | `baseapp-base::platform` |
| `writeJsonAtomic`, `readJsonFile` | `write_json_atomic`, `read_json_file` | `baseapp-base::fs::atomic` |
| `FileOperationQueue` | `FileOperationQueue` | `baseapp-base::fs::queue` |
| `ProductInfo`, `DEFAULT_PRODUCT_INFO` | `ProductInfo`, `default_product_info()` | `baseapp-platform::product` |
| `IEnvironmentService` / `EnvironmentMainService` | `EnvironmentPaths` | `baseapp-platform::environment` |
| `ExternalUrlPolicy` | `ExternalUrlPolicy` | `baseapp-platform::security` |
| `WindowBounds`, `DisplayWorkArea`, `PersistedWindowState` | `WindowBounds`, `DisplayWorkArea`, `PersistedWindowState` | `baseapp-platform::window` |
| `ViewContainerLocation` (`sidebar` \| `auxiliarybar` \| `tertiarybar`) | `ViewContainerLocation` (`Sidebar`, `AuxiliaryBar`, `TertiaryBar`) | `baseapp-platform::window` |
| `SideBarPosition` (`left` \| `right`) | `SideBarPosition` (`Left`, `Right`) | `baseapp-platform::window` |
| `zoomLevelToZoomFactor`, `clampZoomLevel`, `zoomFactorToZoomLevel` | `zoom_level_to_zoom_factor`, `clamp_zoom_level`, `zoom_factor_to_zoom_level` | `baseapp-platform::window` |
| `getMaxSidebarWidth`, `clampSidebarWidth`, `getMaxTertiaryBarHeight`, `clampTertiaryBarHeight` | `max_sidebar_width`, `clamp_sidebar_width`, `max_tertiary_bar_height`, `clamp_tertiary_bar_height` | `baseapp-platform::window` |
| `fitWindowBoundsToDisplays`, `parsePersistedWindowState` | `fit_window_bounds_to_displays`, `parse_persisted_window_state` | `baseapp-platform::window` |
| `AppConfiguration`, `AppConfigurationPatch`, `DEFAULT_CONFIGURATION` | `AppConfiguration`, `AppConfigurationPatch`, `AppConfiguration::default()` | `baseapp-platform::configuration` |
| `parsePersistedConfiguration`, `normalizeConfigurationForPlatform`, `filterConfigurationPatchForPlatform` | `parse_persisted_configuration`, `normalize_configuration_for_platform`, `filter_configuration_patch_for_platform` | `baseapp-platform::configuration` |
| `ConfigurationMainService` | `ConfigurationService` | `baseapp-platform::configuration` |
| `SessionDocument`, `SessionSummary`, `DeleteSessionResult` | `SessionDocument`, `SessionSummary`, `DeleteSessionResult` | `baseapp-platform::sessions` |
| `compareSessionSummaries`, `toSessionSummary`, `SessionRepository`, `SessionsMainService` | `compare_session_summaries`, `SessionDocument::to_summary`, `SessionRepository`, `SessionsService` | `baseapp-platform::sessions` |
| `ThemeMode`, `ResolvedThemeMode`, `ColorRegistry`, `SizeRegistry` | `ThemeMode`, `ResolvedThemeMode`, `ThemePalette`, `ShellMetrics` | `baseapp-platform::theme` |
| `AppLocale`, `LOCALE_RESOURCES`, `i18next` | `AppLocale`, `LocalizationService` | `baseapp-platform::localization` |
| `LogLevel`, `LogsSummary`, `LoggerMainService` | `LogLevel`, `LogsSummary`, `LogService` | `baseapp-platform::log` |
| `UpdateState`, `UpdateStateEvent`, `GitHubReleaseClient`, `isNewerVersion`, `selectWindowsInstaller` | `UpdateState`, `UpdateStateEvent`, `GitHubReleaseClient`, `is_newer_version`, `select_windows_installer` | `baseapp-platform::update` |
| `NativeHostMainService`, `RuntimeInfo`, `TrayMainService` | `NativeHost`, `RuntimeInfo`, `TrayManager`, `StartupLaunchManager` | `baseapp-platform::native` |
| `CodiconName` (49 SVG icons) | `Codicon` + `BaseAppAssets` (`gpui::AssetSource`) | `baseapp-ui::{icon, assets}` |
| `Button`, `InputBox`, `Checkbox`, `SelectBox`, `SegmentedControl`, `Slider`, `Sash`, `ActionBar`, `ContextMenu`, `Dialog`, `ProgressBar`, `Tooltip` | `Button`, `InputBox`/`InputBoxState`, `Checkbox`, `SelectBox`, `SegmentedControl`, `Slider`, `Sash`, `ActionBar`, `ContextMenuOverlay`, `DialogOverlay`, `ProgressBar`, `BaseAppTooltip` | `baseapp-ui::widgets::*` |
| `WorkbenchLayoutService` + `SessionsWorkbenchService` + `WorkbenchThemeService` | `WorkbenchState` (`gpui::Entity<WorkbenchState>`) | `baseapp-workbench::state::workbench_state` |
| `ViewsRegistry` + `ViewDescriptorService` | `ViewDescriptor`, `ViewDescriptorService` | `baseapp-workbench::state::views_registry` |
| `CommandService` + keybindings | GPUI `actions!` + keymap bindings | `baseapp-workbench::state::commands` |
| `TitlebarPart`, `AbstractSidebarPart`/`SidebarPart`/`AuxiliaryBarPart`/`TertiaryBarPart`, `SessionsView`, `EditorPart`, `WelcomeEditorView`, `SettingsEditorView`, `StatusbarPart`, `NotificationsPart`, `StartupOverlay`, `Workbench` | `TitlebarPart`, `SidebarPartView`, `SessionsView`, `EditorPart`, `WelcomeEditorView`, `SettingsEditorView`, `StatusbarPart`, `NotificationsOverlay`, `StartupOverlay`, `WorkbenchView` | `baseapp-workbench::parts::*` |
