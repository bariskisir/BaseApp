# Repository Guidelines

## Project Structure & Architecture

This is an Electron desktop-app starter using React, TypeScript, Vite, Redux Toolkit, SCSS Modules, and Ant Design. Keep process boundaries explicit:

- `src/main/` contains Electron lifecycle, IPC handlers, native services, storage, and security policies.
- `src/preload/` exposes the narrow, capability-limited `window.app` bridge.
- `src/renderer/src/` contains the sandboxed React UI, state, hooks, pages, styles, and localization.
- `src/shared/` holds serializable types, IPC contracts/channels, identity, and cross-process configuration.
- `tests/` mirrors feature areas with Vitest unit tests; `build/` holds app icons and packaging assets.

For any new privileged feature, add a typed shared contract, validate input in the main-process IPC handler, expose only the required preload method, then consume it in the renderer. Never give renderer code direct Node.js or filesystem access.

## Build, Test, and Development Commands

- `npm ci` installs the locked dependencies (Node 24+ and npm 11+).
- `npm run dev` starts Electron with Vite hot reload.
- `npm run build` type-checks and produces production bundles in `out/`.
- `npm run test` runs the Vitest suite once; use `npm run test:watch` during development.
- `npm run lint` runs Biome over source and tests.
- `npm run format` applies Prettier; `npm run format:check` verifies formatting.
- `npm run verify` runs linting, tests, formatting, type checking, and a production build.

## Coding Style & Naming Conventions

Use TypeScript with the repository's strict compiler settings. Prettier is the formatter and Biome provides linting; run both before submitting. Use PascalCase for React components, classes, and `.tsx` component files (for example, `SettingsPage.tsx`); camelCase for functions, values, hooks, and `.ts` modules (for example, `useSessionActions.ts`). Pair component styles with `ComponentName.module.scss`; shared Sass tokens belong in `assets/styles/`.

## Testing Guidelines

Write Vitest tests in `tests/` as `FeatureName.test.ts`, matching existing patterns such as `ExternalUrlPolicy.test.ts`. Cover behavior at public boundaries, including IPC validation, persistence, and security decisions. Run `npm run test` and `npm run typecheck` for focused changes; run `npm run verify` before a PR.

## Commit & Pull Request Guidelines

Recent history uses concise imperative subjects, often Conventional Commit-style scopes, e.g. `fix(providers): route usage HTTP through Electron net.fetch` or `chore(deps-dev): bump js-yaml`. Keep commits focused and avoid unrelated formatting churn. PRs should describe the behavioral change, testing performed, and security impact; link relevant issues and include screenshots for renderer-visible changes.

## Security & Configuration

Preserve sandboxing, context isolation, navigation allow-lists, and schema validation. Keep credentials out of the repository; prefer runtime environment variables such as `APPLICATION_INSIGHTS_CONNECTION_STRING`. Review `SECURITY.md` before handling vulnerability reports.
