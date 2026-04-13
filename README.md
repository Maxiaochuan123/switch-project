# Switch Project Panel

Desktop panel built with Tauri 2 for managing local frontend projects with per-project Node versions.

## Development Environment

This repository uses:

- `Node 24.14.1`
- `npm 11`

The baseline is declared in:

- `.nvmrc`
- `package.json > engines`

Recommended setup on Windows with `nvm-windows`:

```powershell
nvm install 24.14.1
nvm use 24.14.1
npm install
npm run dev
```

If the terminal still reports the wrong Node version after `nvm use`, open a new terminal and retry.

## Version Model

This project has two separate Node version layers:

1. The panel itself
   Use `Node 24.14.1` when developing, linting, or packaging this Tauri app.
2. The frontend projects managed by the panel
   Each managed project can use its own configured Node version.

Example:

- This panel repo runs on `24.14.1`
- Project A can run on `20.20.2`
- Project B can run on `18.20.7`

As long as those versions are installed locally with `nvm-windows`, the panel can launch each project with its configured runtime.

## Commands

Run these commands from the repository root:

```powershell
npm install
npm run contracts:generate
npm run dev
npm run web:dev
npm run lint
npm run web:build
npm run build
```

## Notes

- `npm run dev` starts the Tauri desktop app and automatically starts the Vite dev server.
- `npm run web:dev` starts only the frontend dev server on `http://localhost:1420`.
- `npm run contracts:generate` regenerates `src/shared/contracts.generated.ts` from the Rust contracts in `src-tauri/src/contracts.rs`.
- `npm run build` may fail if local Tauri bundling dependencies or signing tools are missing.
- The panel injects the configured Node version into launched project processes instead of relying on a manual global `nvm use` before every start.
