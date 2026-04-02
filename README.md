# Switch Project Panel

Desktop panel for managing local frontend projects with per-project Node versions.

## Development Environment

This repository uses `Node 24.14.1` for developing and building the panel itself.

Recommended setup on Windows with `nvm-windows`:

```powershell
nvm install 24.14.1
nvm use 24.14.1
npm install
npm start
```

The repository baseline is also declared in:

- `.nvmrc`
- `package.json > engines`

## Important Version Rule

There are two different Node version layers in this project:

1. The panel application itself
   Use `Node 24.14.1` when developing, linting, packaging, or changing this Electron app.
2. The frontend projects managed by the panel
   Each managed project can use its own Node version, configured inside the panel.

Example:

- This panel repo runs on `24.14.1`
- Project A can run on `20.20.2`
- Project B can run on `18.20.7`

As long as those versions are installed locally with `nvm-windows`, the panel can launch them with the configured runtime.

## Commands

```powershell
npm start
npm run lint
npm run package
```

## Notes

- `npm run package` may fail if Electron Forge cannot download packaging assets due to network or TLS issues.
- The panel injects the configured Node version into the launched process instead of relying on a global `nvm use` before every project start.
