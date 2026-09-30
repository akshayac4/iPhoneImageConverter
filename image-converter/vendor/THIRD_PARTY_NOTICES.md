# Third-Party Notices

This folder contains unmodified, third-party browser builds vendored from npm at build time (see `scripts/vendor.mjs`). Regenerate this file with `npm run vendor`.

## heic-to

- **Version:** 1.5.2
- **License:** LGPL-3.0 (full text: `licenses/heic-to-LICENSE.txt`)
- **Source:** https://github.com/hoppergee/heic-to
- **Vendored file:** `heic-to.js` (from `dist/csp/heic-to.js` in the npm package, unmodified)
- **Notes:** Using the /csp build (ES module, named exports `heicTo`/`isHeic`) instead of the default or IIFE build because the default build generates JavaScript at runtime via `new Function(...)` for its embind glue code, which requires the 'unsafe-eval' Content-Security-Policy source. The /csp build avoids that entirely. Kept as a separate, unmodified file per its LGPL-3.0 license.

## UTIF.js (utif2)

- **Version:** 4.1.0
- **License:** MIT (full text: `licenses/utif2-LICENSE.txt`)
- **Source:** https://github.com/photopea/UTIF.js
- **Vendored file:** `UTIF.js` (from `UTIF.js` in the npm package, unmodified)
- **Notes:** Loaded as a plain script; exposes the global `UTIF`. Requires `pako` to be loaded first for deflate-compressed TIFFs.

## pako

- **Version:** 1.0.11
- **License:** MIT AND Zlib (full text: `licenses/pako-LICENSE.txt`)
- **Source:** https://github.com/nodeca/pako
- **Vendored file:** `pako.min.js` (from `dist/pako.min.js` in the npm package, unmodified)
- **Notes:** Dependency of UTIF.js, used to decompress deflate-compressed TIFF strips. Loaded as a plain script; exposes the global `pako`.

## JSZip

- **Version:** 3.10.2
- **License:** (MIT OR GPL-3.0) (full text: `licenses/jszip-LICENSE.txt`)
- **Source:** https://github.com/Stuk/jszip
- **Vendored file:** `jszip.min.js` (from `dist/jszip.min.js` in the npm package, unmodified)
- **Notes:** Loaded as a plain script; exposes the global `JSZip`. Used to build the "Download all" ZIP file.
