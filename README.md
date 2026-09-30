# Web Tools

A collection of small, self-contained, client-side web tools. Each tool lives
in its own top-level folder, works entirely on its own, and can be deployed
at any domain or subfolder without code changes.

## Conventions

Every tool folder:

- Is **self-contained**: no dependency on other tools or on any particular
  host site. It can be copied out of this repo and deployed on its own.
- Is **host-agnostic**: all host/brand/meta settings live in that tool's
  `tool.config.js`. Moving a tool to a different domain, subfolder, or brand
  requires editing only `tool.config.js` (settings/text) and `theme.css`
  (visual tokens), then rebuilding — never touching the tool's logic.
- Uses **vanilla HTML, CSS, and JS (ES modules)**. No frameworks, UI kits,
  bundlers, or TypeScript. Any Node code is limited to the small helper
  scripts in `scripts/`, which have zero runtime dependencies.
- Uses **only relative paths** (`./vendor/...`, `./assets/...`) so the built
  folder works when served from the domain root or from any subfolder.
- Is **catalog-ready**: `npm run build` writes a `tool.json` (from
  `tool.config.js`'s `meta` block) into the built output, so a future
  showcase site can list every tool automatically.

## Repo layout

```
tools/                          <- repo root
  package.json                  <- dev scripts + npm deps used only for vendoring
  scripts/
    vendor.mjs                  <- copies browser builds from node_modules into a tool's vendor/
    build.mjs                   <- builds a tool into dist/<slug>/ with config injected
    dev-server.mjs              <- zero-dependency static server for local development
  <tool-slug>/
    index.html, app.js, ...     <- the tool itself
    tool.config.js              <- single source of truth for host/brand/meta settings
    theme.css                   <- visual tokens (colors, fonts, radii) — the only rebrand surface
    styles.css                  <- layout/components, built only from theme.css tokens
    vendor/                     <- committed third-party browser builds + THIRD_PARTY_NOTICES.md
    assets/                     <- icons, screenshots
    test-assets/                <- test files, excluded from the build
  dist/                         <- build output (git-ignored)
```

## Scripts

```bash
npm install        # installs the npm packages used for vendoring third-party browser builds
npm run dev         # serves the whole repo at http://localhost:8080 (needed for ES modules/WASM)
npm run vendor       # re-copies vendored library builds into a tool's vendor/ folder
npm run build -- <tool-slug>   # builds dist/<tool-slug>/, a fully static, deployable folder
```

## Tool catalog

| Tool | Folder | Audience | Status | Live URL | Notes |
|---|---|---|---|---|---|
| Image Converter | [`image-converter/`](image-converter/) | Consumer | In development | – | HEIC/JPG/PNG/WebP/TIFF, fully client-side |

## Adding a new tool

1. Create a new top-level folder for the tool (its slug).
2. Copy the shape of an existing tool: `index.html`, `app.js`, `tool.config.js`,
   `theme.css`, `styles.css`, `vendor/`, `assets/`, `test-assets/`, `README.md`.
3. Fill in `tool.config.js` with the tool's `slug`, `meta`, and default
   `site`/`credit`/`cta`/`analytics` settings.
4. If the tool needs third-party browser libraries, add them as
   `devDependencies` in the root `package.json`, then extend
   `scripts/vendor.mjs` with an entry describing how to copy their browser
   build into the tool's `vendor/` folder.
5. Run `npm run vendor` and `npm run build -- <slug>` to confirm the tool
   builds cleanly.
6. Add a row to the catalog table above.
