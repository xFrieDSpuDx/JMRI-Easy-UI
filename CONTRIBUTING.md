# Contributing to jmri-easy-ui

Thanks for helping out! ❤️ This project is a lightweight web UI that talks to a running **JMRI** instance.

---

## Requirements

- **Node.js 18+** (Node 20 LTS recommended)
- **npm 9+** (ships with Node)
- A reachable **JMRI Web Server** exposing the endpoints listed below

---

## Getting started

```bash
cd web
npm ci
npm run dev
```

- Open **http://localhost:5173** (Vite default).
- Ensure your JMRI instance is reachable from the browser. The app calls same-origin endpoints like `/api/roster`, `/json/turnouts`, etc.

> If you’re serving the UI directly via JMRI (instead of `npm run dev`), build first (see below) and deploy the `dist/` output so JMRI can serve the static assets.

---

## Build

```bash
cd web
npm run build
```

This emits production files to `web/dist/`.

If you use the provided deploy helper, it copies back into `web/` so JMRI can serve static files without mapping changes.

---

## Lint & format

```bash
cd web
npm run lint
npm run format
```

- ESLint config: `web/eslint.config.mjs`
- Enforces JSDoc for public functions and a minimum identifier length (with sensible exceptions).

---

## Project layout (high level)

```
web/
  js/                # Application source
  styles/            # CSS
  assets/            # Static assets
  dist/              # Build output (generated)
  esbuild.config.mjs # Production build pipeline
  vite.config.js     # Dev server / local build
```

---

## Commit style

- Keep commits focused and descriptive.
- Reference issues: e.g. `Fixes #123` where appropriate.
- If changing UI/UX, include screenshots or GIFs in the PR.

---

## Pull request checklist

- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] Tests pass (if/when added)
- [ ] For API changes, describe the endpoint(s) impacted and update docs where relevant

---

## Local JMRI notes

This UI expects the JMRI web server to expose:

- `/api/roster`, `/api/roster/*`
- `/json/turnouts`, `/json/turnout/*`
- `/api/connections`, `/api/connections/select`
- `/api/jmri/*` (CV read/write helpers)
- `/api/decoder/identify` (if using decoder features)

If your endpoints differ, adapt the paths in `web/js/services/jmri.js`.

---

## Development tips

- The code uses **modules** and modern browser APIs; target is roughly ES2019+.
- The UI relies on top-layer `<dialog>` where available, with fallbacks.
- Keep DOM selectors centralized (see `js/controllers/**/selectors.js`) to avoid drift.

---

## Code of Conduct

By participating, you agree to abide by the **Code of Conduct** in `CODE_OF_CONDUCT.md`.

---

## License

Contributions are licensed under the repository’s primary license. See `LICENSE`.
