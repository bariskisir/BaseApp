# BaseApp -- Development Guide

## Project Overview

BaseApp is a secure, reusable Electron desktop starter at version 1.0.0. It is intentionally domain-neutral: there is no transcription, translation, audio capture, or provider-specific code. The retained application shell includes generic local session workspaces, compact mode, settings, localization, logging, privacy-bounded startup telemetry, tray behavior, durable window state, packaging, and GitHub-based updates.

The project is designed to be copied or extended into other desktop products. Domain features should build on the existing process boundaries instead of weakening them.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 24 or newer |
| Desktop shell | Electron 43.3 with `vite-plugin-electron` 1.1 |
| Build | Vite 8.2 |
| Language | TypeScript 7.0 |
| UI | React 19.2, Redux Toolkit 2.12, React Redux 9.3 |
| Components | Ant Design 6.5, Lucide React 1.31 |
| Styling | SCSS 1.102 and co-located SCSS Modules |
| Localization | i18next 26.3 and react-i18next 17 |
| Validation | Zod 4.4 |
| Logging | electron-log 5.4 plus a typed renderer bridge |
| Quality | Biome 2.5, Prettier 3.9, Vitest 4.1 |
| Packaging | electron-builder 26.15 |

## Directory Structure

```text
BaseApp/
├── .github/                       # CI, tagged releases, and Dependabot configuration
├── build/                         # SVG, PNG, and ICO application icons
├── images/                        # README screenshots (1.png and 2.png)
├── src/
│   ├── shared/                    # Serializable cross-process contracts
│   │   ├── appInfo.ts             # Application identity and telemetry fallback configuration
│   │   ├── IpcChannel.ts          # Approved IPC command and event names
│   │   └── types.ts               # Settings, sessions, updater events, and AppApi
│   ├── main/
│   │   ├── index.ts               # Application lifecycle and service composition
│   │   ├── ipc.ts                 # Validated IPC handlers
│   │   ├── ApplicationPaths.ts    # Data, Logs, Runtime, and Session paths
│   │   ├── settingsSchema.ts      # Complete and partial settings validation
│   │   ├── windowState.ts         # Durable window-bounds validation and fitting
│   │   ├── security/
│   │   │   └── RendererNavigationPolicy.ts
│   │   ├── services/
│   │   │   ├── AppUpdater.ts
│   │   │   ├── GitHubReleaseClient.ts
│   │   │   ├── LoggerService.ts
│   │   │   ├── StorageService.ts
│   │   │   ├── TrayService.ts
│   │   │   └── WindowService.ts
│   │   └── telemetry/
│   │       └── telemetry.service.ts
│   ├── preload/
│   │   └── index.ts               # Typed contextBridge implementation
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── components/        # Titlebar, navigation, window controls, sessions
│           ├── context/           # Theme and Ant Design providers
│           ├── hooks/             # Initialization and renderer action boundaries
│           ├── i18n/              # Initialization and 10 locale resources
│           ├── pages/             # Generic workspace and settings
│           ├── services/          # Renderer logger and settings persistence queue
│           ├── store/             # Redux store and single app slice
│           ├── types/             # Renderer global declarations
│           └── utils/             # Date and session-summary helpers
├── tests/                          # 14 Vitest files, currently 109 tests
├── .node-version                  # Shared Node.js major for local tools
├── biome.json                     # Explicit lint policy; formatting stays with Prettier
├── SECURITY.md                    # Vulnerability-reporting policy
├── vite.config.mts
├── vitest.config.mts
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
└── package.json
```

## Commands

```bash
npm run dev                 # Start Vite and Electron with renderer hot reload
npm run start               # Build and launch the production Electron bundles
npm run build               # Typecheck node/web projects and build all processes
npm run verify              # Lint, test, format-check, and build in CI order
npm run typecheck           # Typecheck node and renderer projects
npm run typecheck:node      # Main, preload, configuration, and tests
npm run typecheck:web       # Renderer only
npm run test                # Run the Vitest suite once
npm run test:watch          # Run Vitest in watch mode
npm run lint                # Biome lint for source, tests, and Vite/Vitest configs
npm run format              # Format code files only
npm run format:check        # Check code-file formatting only
npm run package             # Build an unpacked application directory
npm run package:win         # Build Windows x64 and arm64 NSIS installers
npm run package:win:x64     # Build only the Windows x64 installer
npm run package:win:arm64   # Build only the Windows arm64 installer
npm run package:mac         # Build macOS x64 and arm64 DMG files
npm run package:mac:x64     # Build only the macOS x64 DMG
npm run package:mac:arm64   # Build only the macOS arm64 DMG
npm run package:linux       # Build Linux x64 and arm64 AppImages
npm run package:linux:x64   # Build only the Linux x64 AppImage
npm run package:linux:arm64 # Build only the Linux arm64 AppImage
npm run release             # Build Windows and Linux release artifacts
```

Prettier intentionally targets only:

- `src/**/*.{ts,tsx,scss,html}`
- `tests/**/*.{ts,tsx}`
- root `*.{ts,mts}`

Markdown, JSON, `package.json`, and `package-lock.json` are not part of the Prettier scripts.

## Application Identity and Shared Configuration

`src/shared/appInfo.ts` is the source of truth for application identity and stable shared configuration used by runtime source and tests:

- `APP_NAME`
- `APP_SLUG`
- `APP_OWNER`
- `APP_ID`
- `APP_USER_AGENT`
- `APP_AUTHOR`
- `APP_AUTHOR_URL`
- `APP_REPO`
- `APP_REPO_URL`
- `APPLICATION_INSIGHTS_CONNECTION_STRING`
- `resolveApplicationInsightsConnectionString`

Do not repeat the application name in source or tests when one of these constants can derive it. Generic capabilities use names such as `AppApi`, not product-specific API names.

Renaming a downstream application still requires updating packaging metadata in `package.json`, README links/content, icons, and repository metadata in addition to `APP_NAME`.

## Architecture

### Three-Process Separation

1. **Main process** owns Electron and Node.js capabilities, durable storage, logging, telemetry, tray behavior, window state, external URLs, and updates.
2. **Preload** is the only bridge. It exposes the typed `AppApi` as `window.app` through `contextBridge`.
3. **Renderer** is a sandboxed React application. Shared UI state lives in one Redux slice, and system actions go through `window.app`.

The renderer must not import Node.js or Electron APIs.

### IPC and Security

- All channel names are enumerated in `src/shared/IpcChannel.ts` using `namespace:action`.
- Request/response calls use `ipcRenderer.invoke` and `ipcMain.handle`.
- Main-to-renderer events cover updater state, native maximize state, and tray-requested settings navigation.
- IPC inputs are validated with Zod or explicit primitive checks.
- Every handler verifies both the active window's `webContents` and its main frame.
- External navigation is limited to GitHub and the configured author origin.
- Renderer navigation accepts only the packaged renderer document or the exact Vite development origin.
- Popups are denied, all renderer permission requests are denied, context isolation and sandboxing are enabled, and Node integration is disabled.

### Application Paths

`ApplicationPaths.ts` creates an isolated layout below the operating system's application-data directory:

```text
BaseApp/
├── Data/
│   ├── settings.json
│   ├── telemetry.json
│   ├── window-state.json
│   └── sessions/
├── Logs/
└── Runtime/
    └── Session/
```

Chromium runtime and session files stay outside durable `Data`. Do not persist product data in `Runtime`.

## Generic Sessions

A session contains:

- UUID identity
- title and default-title flag
- creation and update timestamps
- a generic `Record<string, unknown>` data object

The sidebar supports create, select, rename, and delete. There must always be at least one session; deleting the last session creates and returns a replacement. Session JSON access and settings writes are serialized to prevent concurrent updates from overwriting one another. Durable JSON documents are written to a temporary sibling and atomically renamed so a partial write cannot replace the last valid document.

When adding downstream domain data, update `SessionData`, storage validation, IPC contracts, Redux state/actions, workspace UI, and tests together. Do not restore transcription-specific field names or services.

## Renderer State and UI

- `appSlice.ts` is the single Redux slice.
- Top-level pages are `home` and `settings`.
- Settings sections are general, display, updates, telemetry, logging, and about.
- Compact mode hides the session sidebar and is intentionally retained.
- Navigating away from the home workspace exits compact mode.
- Settings writes pass through `SettingsPersistenceQueue` so rapid changes persist in order.
- Theme modes are system, light, and dark.
- The Ant Design primary color is green (`#00b96b`).
- Session file icons use separate blue theme tokens and must not inherit the green primary color.
- The application logo is sourced from the icon assets in `build/`.

## Settings

Fresh installations use these notable defaults:

| Setting | Default |
| --- | --- |
| Interface language | English |
| Theme | System |
| Navigation position | Top |
| Page zoom | 100% |
| Time format | 24-hour |
| Always on top | Off |
| Show tray icon | On |
| Minimize to tray on close | On |
| Check for updates on startup | On |
| Unattended updates | Off |
| Anonymous startup telemetry | Off |
| Log level | Info |

Linux disables tray UI behavior at the IPC boundary. A new setting requires synchronized changes to the shared type/defaults, Zod schemas and persisted parsing, UI controls, localization, relevant service application, and tests.

## Updates

`GitHubReleaseClient` reads the latest stable GitHub release, validates repository-scoped asset URLs and metadata, selects the exact architecture-specific installer, streams it to a temporary update directory, verifies its size, and checks a SHA-256 digest when GitHub provides one.

- Packaged Windows builds download NSIS installers named from `APP_SLUG`, version, and architecture.
- macOS, Linux, development builds, and unpackaged Windows builds report the release page instead of attempting an incompatible installer download.
- Manual installation remains available after a download.
- Unattended updates are disabled by default.
- Silent installation occurs only when both `autoUpdate` and `unattendedUpdates` are enabled.
- The Windows installer uses `/S --updated --force-run`, then the running application exits.
- Settings changes are applied to the updater immediately through the IPC save handler.

Keep unattended behavior opt-in. Do not make it independent of startup update checks without an explicit product decision.

## Telemetry and Logging

Telemetry is opt-in and disabled on fresh installations. It sends at most one startup event per process when enabled. The payload is limited to application name, version, platform, locale, and a durable anonymous UUID. It does not include IP tags or session content. The main process prefers a non-empty `APPLICATION_INSIGHTS_CONNECTION_STRING` environment variable and falls back to the checked-in value centralized in `appInfo.ts`. Connection-string parsing and telemetry setup are deferred until telemetry is enabled; failures are logged and do not prevent startup.

Main-process logging uses separate general and warning/error daily files. Renderer diagnostics pass through a typed IPC log bridge. Use the logging services instead of `console` calls.

## Localization

Supported locales are English, Turkish, German, French, Portuguese, Chinese, Spanish, Russian, Japanese, and Korean. `AppLocale` defines the supported language codes, `DEFAULT_APP_LOCALE` keeps English as the centralized default and runtime fallback, and the independent `LocaleResource` interface defines the complete translation contract. Every locale must implement that contract explicitly; `createLocale` must not fill omitted translations from English.

When adding a UI key:

1. Add the complete English value.
2. Add the corresponding value to every translated resource.
3. Keep Ant Design locale mapping synchronized.
4. Run `Localization.test.ts` to verify used keys, exact resource parity, interpolation variables, non-empty values, and surrounding whitespace.

## Coding Conventions

### TypeScript

- Keep strict mode, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.
- Do not use `any`; validate unknown boundary data.
- Give exported classes, functions, interfaces, and type aliases JSDoc comments.
- Use the `@main/*`, `@shared/*`, and `@renderer/*` aliases.
- Derive union types from `as const` arrays where practical.
- Keep public API parameter and return types explicit.
- Keep TypeScript build metadata under `node_modules/.cache`; do not leave `*.tsbuildinfo` files in the repository root.

### React

- Use functional components and hooks.
- Keep cross-component state in Redux.
- Put system and persistence operations in custom hooks.
- Keep components focused on presentation.
- Use co-located SCSS Modules and existing CSS variables.
- Preserve the lazy-loaded settings page unless startup requirements change.

### Main-Process Services

- Prefer explicit constructor dependency injection.
- Keep filesystem and Electron APIs out of renderer code.
- Serialize concurrent writes targeting the same durable document.
- Keep security policy logic isolated and testable.
- Log operational failures with bounded, non-sensitive details.

## Testing

Vitest runs in the Node environment; `jsdom` is intentionally not installed. The current suite has 14 files and 109 tests:

- Redux shell, session, compact-mode, and updater state
- attended and unattended updater behavior
- GitHub release validation, caching, architecture selection, download integrity, and repository URL restrictions
- date/session formatters
- IPC channel naming and required surface
- 10-locale resolution, explicit resource completeness, interpolation safety, and renderer key usage
- logger behavior
- renderer navigation policy
- serialized renderer settings persistence
- persisted settings validation
- generic session and settings storage
- privacy-bounded telemetry
- tray lifecycle and menu behavior
- durable window-state restoration

Use isolated temporary directories or explicit filesystem mocks. Tests must not depend on real AppData, live GitHub releases, or telemetry network access. When modifying currently uncovered boundaries such as `GitHubReleaseClient`, complete IPC handler behavior, preload wiring, or `WindowService`, add focused tests with injected dependencies or Electron mocks.

Before release, run:

```bash
npm run verify
npm audit
```

## Packaging and Releases

- Windows artifacts are NSIS installers for x64 and arm64.
- macOS x64 and arm64 DMG scripts are available for local or downstream macOS runners; the starter does not publish unsigned macOS artifacts from tagged releases.
- Linux artifacts are AppImages for x64 and arm64.
- `.github/workflows/ci.yml` runs the complete verification and a high-severity dependency audit for branches and pull requests.
- `.github/workflows/release.yml` runs on `v*` tags with Node.js 24.
- The workflow validates that the tag matches `package.json` on Windows, verifies source, packages both platforms, and publishes a GitHub release.
- Dependabot checks npm packages and GitHub Actions weekly.
- Linux arm64 packaging is currently allowed to fail without blocking the release; x64 and Windows artifacts are required.

Keep package version, release tag, artifact naming, updater selection, and README release links synchronized.
