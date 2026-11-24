# Repository Guidelines

## Project Structure & Architecture

This is an Electron desktop-app starter built with pure TypeScript, direct DOM rendering, SCSS, and Vite (zero React, Ant Design, Lucide, or `react-i18next`), organized into a 4-tier layered architecture under `src/app/` (with `@app/*` path mapping):

- `src/app/base/`: Zero-domain-dependency primitives (`common/` lifecycle with `DisposableTracker`, events, async, color, formatters, number, platform; `node/` atomic file I/O and `FileOperationQueue`; `browser/` `dom.ts` `$` DOM builder, `browser.ts` zoom/fullscreen state, `codicons.ts` with 49 inline 16x16 SVG Codicons, `domStylesheets.ts`, and the reusable pure-DOM `ui/` widget library: `Widget`, `Button`, `InputBox`, `Checkbox`, `SelectBox`, `SegmentedControl`, `Slider`, `Sash`, `ActionBar`, `ContextMenu`, `Dialog`, `ProgressBar`, `Tooltip`), `parts/` (`ipc/` with `ProxyChannel`, `ValidatedIpcMain`, `ElectronIpcServer`, `ElectronIpcClient`; `sandbox/` with `preload.ts` exposing `window.baseapp` including `webFrame.setZoomLevel`), and co-located `test/` helpers and unit suites.
- `src/app/platform/`: Reusable desktop platform services, schemas, IPC adapters, registries, and co-located `test/` suites (`instantiation/` including `TestInstantiationService`, `registry/`, `theme/` with `ColorRegistry`/`widgetColors`/`SizeRegistry`/`ThemingRegistry`/`ThemeMainService`, `configuration/`, `sessions/`, `state/`, `window/` with `1.2 ** zoomLevel` scaling, Primary/Secondary/Tertiary sidebar clamping with minimum defaults `170px` / `120px`, `35px` `titleBarOverlay`, and `electron-browser/window.ts` zoom helpers, `native/` with `getRuntimeInfo` and fullscreen IPC, `tray/`, `log/`, `update/`, `telemetry/`, `localization/` via `i18next`, `product/`, `environment/`, `lifecycle/`, `commands/`, `security/`).
- `src/app/workbench/`: Sandboxed pure-DOM renderer workbench (`common/` contributions, `ViewsRegistry`, `SettingsRegistry`, and workbench theme tokens; `services/` DI singletons such as `WorkbenchThemeService`, `WorkbenchLayoutService`, `ViewDescriptorService`, `SessionsWorkbenchService`, `WorkbenchConfigurationService`, `WorkbenchLocalizationService`, `DialogService`, `ContextMenuService`, `NotificationService`, `WorkbenchUpdateService`, `WorkbenchLifecycleService`, `CommandService`; `browser/` `Component`/`Part`/`IViewPane` shell, `Workbench` with left/right sidebar placement and center editor + bottom tertiary bar column, `TitlebarPart` with top navigation and 3-sidebar layout controls, shared `AbstractSidebarPart` hosting Primary `SidebarPart`, Secondary `AuxiliaryBarPart`, and bottom Tertiary `TertiaryBarPart` with 3-way move menu, drag-and-drop & context-menu view relocation, `EditorPart` with Welcome & searchable `SettingsEditor` views including About link-list + bottom System & Runtime view, `StatusbarPart` with prominent Zoom entry, `NotificationsPart`, `StartupOverlay`; `contrib/` modular sessions/settings/window contributions; `electron-browser/` `DesktopMain` bootstrap; co-located `test/` suites).
- `src/app/code/`: Thin application entrypoints for `electron-main/` (`index.ts`, `main.ts`, `app.ts`) and `electron-browser/` (`index.html`, `entry.ts`), plus co-located tests.
- `src/app/test/`: Cross-cutting architectural boundary and repository hygiene tests.
- `build/`: App icons and packaging assets.

## Layer Rules & Dependency Injection

Keep vertical and runtime layer boundaries strict (automatically enforced by `src/app/test/architecture/layerBoundaries.test.ts`):

- **Vertical dependencies:** `base` -> `platform` -> `workbench` -> `code` only. Higher layers may depend on lower layers; never import upward.
- **Runtime isolation:**
  - `*/common/*`: Pure TypeScript only — never import `node:*`, `electron`, `*/node/*`, `*/browser/*`, `*/electron-main/*`, or `*/electron-browser/*`.
  - `*/node/*`: Node.js only — never import `electron`, `*/browser/*`, `*/electron-main/*`, or `*/electron-browser/*`.
  - `*/browser/*`: Browser/UI only — never import `node:*`, `electron`, `*/node/*`, or `*/electron-main/*`.
- **Zero third-party UI frameworks:** Never import or declare dependencies on `react`, `react-dom`, `antd`, `@ant-design/*`, `lucide-react`, or `react-i18next` anywhere in `src/app/` or `package.json`. Build renderer UI strictly with `src/app/base/browser/dom.ts`, `codicons.ts`, and `src/app/base/browser/ui/` widgets.
- **Validated IPC exclusivity:** Only `src/app/base/parts/ipc/electron-main/validatedIpcMain.ts` may import `ipcMain` from `'electron'`. All privileged features must expose typed contracts via `ProxyChannel` with Zod validators on the main-process server channel and never grant the renderer direct Node.js or filesystem access.
- **DI & registries:** Define service tokens with `createDecorator<IService>(id)`, inject dependencies with `@IService` constructor parameter decorators, register workbench singletons via `registerSingleton(..., InstantiationType.Eager | Delayed)`, register movable sidebar views via `registerView(...)` in `ViewsRegistry`, register settings views via `registerSettingsCategory(...)`, and instantiate workbench parts and views through `IInstantiationService.createInstance(...)`. Do not reintroduce Redux or React.
- **Dynamic theming & typography:** Register color and size tokens in `ColorRegistry` / `SizeRegistry` following BaseApp's Dark (`#1F1F1F` workbench/editor, `#181818` chrome, `#0078D4` accent) and Light (`#FFFFFF` workbench/editor, `#F8F8F8` chrome, `#005FB8` accent) palettes, native platform/CJK/monospace font stacks, and shell chrome dimensions (`35px` titlebar/tabs/sidebar header, `22px` statusbar, `200px` settings TOC), and register dynamic styling participants in `ThemingRegistry`. Consume generated `--baseapp-*` CSS variables in SCSS stylesheets instead of duplicating static color tokens.

## Build, Test, and Development Commands

- `npm ci` installs locked dependencies (Node 24+ and npm 11+).
- `npm run dev` starts Electron with Vite hot reload.
- `npm start` builds and launches the production Electron bundles locally.
- `npm run typecheck` runs `tsc --noEmit` across `tsconfig.node.json`, `tsconfig.web.json`, and `tsconfig.test.json`.
- `npm run build` type-checks and produces production bundles in `out/`.
- `npm run test` runs the co-located Vitest suite once; use `npm run test:coverage` for V8 coverage reports and `npm run test:watch` during development.
- `npm run lint` runs Biome over `src`, `vite.config.mts`, and `vitest.config.mts`.
- `npm run format` applies Prettier across `src/**/*.{ts,scss,html}`, `vite.config.mts`, and `vitest.config.mts`; `npm run format:check` verifies formatting.
- `npm run verify` runs linting, tests, format checking, type checking, and a production build.

## Coding Style & Hygiene Policy

- **Zero-comment policy:** Do NOT write comments (`//`, `/* */`, `/** */`, `<!-- -->`) anywhere in `.ts`, `.tsx`, `.mts`, `.scss`, or `.html` files under `src/app/`, `vite.config.mts`, or `vitest.config.mts`. Write self-explanatory identifiers and small, focused modules. This rule is enforced in CI by `src/app/test/architecture/layerBoundaries.test.ts`.
- **Strict TypeScript:** Follow `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, and `experimentalDecorators`. Run Biome (`npm run lint`) and Prettier (`npm run format:check`) before finishing.
- **Naming & UI conventions:** Use PascalCase for classes, parts, and widgets (`TitlebarPart`, `AuxiliaryBarPart`, `TertiaryBarPart`, `SettingsEditorView`, `SelectBox`), and camelCase for services, functions, `.ts` modules, and co-located `.scss` stylesheets (`titlebarPart.ts`, `titlebarPart.scss`, `workbenchThemeService.ts`). Render UI icons using bundled SVG Codicons (`renderCodicon` / `setCodicon` from `@app/base/browser/codicons`, e.g. `'settings-gear'`) and never reference `Settings2` (enforced by `src/app/test/architecture/layerBoundaries.test.ts`).

## Testing Guidelines

Write co-located Vitest suites under `src/app/**/test/{common,node,browser,electron-main,electron-browser}/*.test.ts` (and architectural checks under `src/app/test/architecture/`). Guard suites with `ensureNoDisposablesAreLeakedInTestSuite()` from `@app/base/test/common/utils`, use `TestInstantiationService` from `@app/platform/instantiation/test/common/instantiationServiceMock` for DI service/part tests, and use the lightweight Node fake-DOM harness (`@app/base/test/browser/fakeDom`) for pure-DOM widget and workbench UI tests without adding external DOM packages. Cover architectural invariants, pure-DOM widgets and Codicons, DI/registry behavior, movable views and 3-sidebar layout (Primary/Secondary/Tertiary), window zoom calculations, IPC proxy/validation boundaries, persistence, security policies, theme tokens, localization parity, workbench services, and workbench parts. Run `npm run test`, `npm run test:coverage`, and `npm run typecheck` while iterating, and run `npm run verify` before opening a PR.

## Commit & Pull Request Guidelines

Use concise imperative commit subjects with Conventional Commit scopes (e.g., `fix(ipc): validate channel sender origin`). Keep commits focused without unrelated churn. PRs should describe behavioral changes, verification performed, and security impact, with screenshots for UI changes.

## Security & Configuration

Preserve renderer sandboxing, context isolation, `ValidatedIpcMain` sender/origin checks, navigation allow-lists, external URL allow-lists, and Zod schema validation. Keep credentials out of the repository and prefer runtime environment variables such as `APPLICATION_INSIGHTS_CONNECTION_STRING`. Review `SECURITY.md` before handling vulnerability reports.
