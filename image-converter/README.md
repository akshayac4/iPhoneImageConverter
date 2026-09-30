# Image Converter

A free, private image format converter. All conversion happens in the
browser — no file is ever uploaded to a server.

## Supported formats

| Input | Decoder |
|---|---|
| HEIC, HEIF | `heic-to` (libheif, via WebAssembly/asm.js) |
| JPG/JPEG, PNG, WebP | Native (`createImageBitmap`) |
| TIFF/TIF (first page) | `utif2` (UTIF.js) |
| GIF, BMP, AVIF | Native, best effort, first frame only for GIF |

Output: JPG, PNG, WebP (WebP is disabled automatically in browsers that
can't encode it, e.g. some Safari versions).

Format is detected primarily from file contents (magic bytes), falling back
to the file extension when sniffing is inconclusive.

## Running locally

From the repo root:

```bash
npm install
npm run dev
```

Then open `http://localhost:8080/image-converter/`. A real server is
required (not `file://`) because ES modules and the vendored libraries
don't load correctly from the filesystem.

## Building for deployment

```bash
npm run vendor              # only needed after changing library versions
npm run build -- image-converter
```

This produces `dist/image-converter/`, a fully static folder with SEO tags
injected from `tool.config.js`. Deploy it to any domain or subfolder — it
uses only relative paths and needs no server-side code.

## Rebranding / re-hosting

- Edit `tool.config.js` for all text, host links, and metadata.
- Edit `theme.css` for all colors, fonts, radii, and shadows.
- Rebuild. No other files need to change.

## Content-Security-Policy

If you host this tool behind a CSP, it needs:

```
script-src 'self';
connect-src 'self';
img-src 'self' blob:;
style-src 'self';
```

Notes:

- **No `'unsafe-eval'` or `'wasm-unsafe-eval'` is required.** `heic-to` ships
  a default build that generates JavaScript at runtime (`new Function(...)`)
  for its embind glue code, which needs `'unsafe-eval'`. This tool
  deliberately uses the `heic-to/csp` build instead (see
  `vendor/THIRD_PARTY_NOTICES.md`), which avoids that entirely.
- `img-src` needs `blob:` because thumbnails, previews, and downloads are
  all served from `URL.createObjectURL()`.
- No `connect-src` beyond `'self'` is ever needed — this tool makes no
  network requests other than loading its own local files (scripts, CSS,
  assets). If you add analytics later, extend `connect-src` accordingly and
  keep events anonymous, per the tool's privacy guarantees.

## Privacy guarantees

- No file data or file name is ever sent over the network.
- The only network requests are for the tool's own local files (its
  scripts, vendored libraries, and assets) — verified during testing by
  watching DevTools' Network tab during conversion.
- Converted images lose EXIF metadata (GPS, camera info) because they're
  produced by redrawing onto a canvas and re-encoding — this is called out
  in the UI as a privacy benefit, not a defect.

## Known limitations

- **No real HEIC test samples are included.** `test-assets/` has a
  corrupted `.heic` file (random bytes) to test error handling, but real
  iPhone HEIC photos should be supplied separately for a full manual test
  of that decode path.
- **`assets/screenshot.png` is not included yet.** Add a 1280×800 screenshot
  of the tool in use before publishing to a showcase site.
- GIF conversion only reads the first frame (per spec — this is a
  converter, not an animation tool).
- Very large files (over 50MB) show a non-blocking warning; extremely large
  batches on low-memory mobile devices may still be slow, since files are
  processed sequentially by design (to avoid exhausting memory).
- The `heic-to` and `utif2` libraries are compiled to asm.js rather than a
  separate `.wasm` binary (this is how those npm packages ship, not a
  choice made here) — the "libheif compiled to WASM" language in the spec
  refers to libheif's compile target in general; no `.wasm` file needs to
  be hosted separately.

## Test assets

`test-assets/` contains synthetic fixtures used for manual testing (never
included in the build):

- `transparent.png` — PNG with an alpha-transparent circle.
- `exif-orientation-6.jpg` — baseline JPEG with an injected EXIF
  Orientation=6 tag (rotate 90° CW to display correctly).
- `sample.webp` — a small WebP image.
- `multipage.tiff` — an uncompressed, 2-page RGB TIFF (red page, then blue
  page) to verify only the first page is used.
- `sample.gif` — a small 4-color GIF.
- `corrupted.heic` — random bytes with a `.heic` extension, to verify error
  handling.

Regenerate them with `node test-assets/generate.mjs`. That script builds
the PNG, TIFF, GIF, and corrupted file from scratch using only Node's
built-in modules. The JPEG and WebP start from a real browser canvas
(`canvas.toBlob(...)`) since hand-rolling those encoders isn't practical —
if you need to regenerate `sample.webp` or the pre-EXIF baseline JPEG, draw
a small canvas in any browser, export it with `toBlob('image/jpeg' | 'image/webp')`,
save it as `sample.webp` / `test-assets/baseline-for-exif.jpg`, then run
`generate.mjs` to inject the EXIF tag and clean up.
