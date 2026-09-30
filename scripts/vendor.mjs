#!/usr/bin/env node
// Copies browser-ready builds of third-party libraries from node_modules into
// a tool's vendor/ folder, and regenerates that folder's THIRD_PARTY_NOTICES.md.
//
// Usage: node scripts/vendor.mjs [tool-slug]   (defaults to image-converter)

import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const toolSlug = process.argv[2] || 'image-converter';
const toolDir = join(repoRoot, toolSlug);
const vendorDir = join(toolDir, 'vendor');

function pkgVersion(pkgName) {
  const pkgJsonPath = join(repoRoot, 'node_modules', pkgName, 'package.json');
  return JSON.parse(readFileSync(pkgJsonPath, 'utf8')).version;
}

// Each entry describes one vendored file: which package it comes from, which
// file inside that package to copy, what to name it in vendor/, and the
// metadata needed for THIRD_PARTY_NOTICES.md.
const libraries = [
  {
    name: 'heic-to',
    pkg: 'heic-to',
    from: 'dist/csp/heic-to.js',
    to: 'heic-to.js',
    license: 'LGPL-3.0',
    licenseFile: 'LICENSE',
    homepage: 'https://github.com/hoppergee/heic-to',
    notes:
      'Using the /csp build (ES module, named exports `heicTo`/`isHeic`) instead of the default or IIFE build ' +
      'because the default build generates JavaScript at runtime via `new Function(...)` for its embind glue code, ' +
      "which requires the 'unsafe-eval' Content-Security-Policy source. The /csp build avoids that entirely. " +
      'Kept as a separate, unmodified file per its LGPL-3.0 license.',
  },
  {
    name: 'UTIF.js (utif2)',
    pkg: 'utif2',
    from: 'UTIF.js',
    to: 'UTIF.js',
    license: 'MIT',
    licenseFile: 'LICENSE',
    homepage: 'https://github.com/photopea/UTIF.js',
    notes: 'Loaded as a plain script; exposes the global `UTIF`. Requires `pako` to be loaded first for deflate-compressed TIFFs.',
  },
  {
    name: 'pako',
    pkg: 'pako',
    from: 'dist/pako.min.js',
    to: 'pako.min.js',
    license: 'MIT AND Zlib',
    licenseFile: 'LICENSE',
    homepage: 'https://github.com/nodeca/pako',
    notes: 'Dependency of UTIF.js, used to decompress deflate-compressed TIFF strips. Loaded as a plain script; exposes the global `pako`.',
  },
  {
    name: 'JSZip',
    pkg: 'jszip',
    from: 'dist/jszip.min.js',
    to: 'jszip.min.js',
    license: '(MIT OR GPL-3.0)',
    licenseFile: 'LICENSE.markdown',
    homepage: 'https://github.com/Stuk/jszip',
    notes: 'Loaded as a plain script; exposes the global `JSZip`. Used to build the "Download all" ZIP file.',
  },
];

const licensesDir = join(vendorDir, 'licenses');
mkdirSync(vendorDir, { recursive: true });
mkdirSync(licensesDir, { recursive: true });

const notesLines = [
  '# Third-Party Notices',
  '',
  `This folder contains unmodified, third-party browser builds vendored from npm at build time (see \`scripts/vendor.mjs\`). Regenerate this file with \`npm run vendor\`.`,
  '',
];

for (const lib of libraries) {
  const version = pkgVersion(lib.pkg);
  const srcFile = join(repoRoot, 'node_modules', lib.pkg, lib.from);
  const destFile = join(vendorDir, lib.to);
  copyFileSync(srcFile, destFile);

  const licenseDestName = `${lib.pkg}-LICENSE.txt`;
  copyFileSync(join(repoRoot, 'node_modules', lib.pkg, lib.licenseFile), join(licensesDir, licenseDestName));

  console.log(`vendored ${lib.pkg}@${version}: ${lib.from} -> ${toolSlug}/vendor/${lib.to}`);

  notesLines.push(`## ${lib.name}`);
  notesLines.push('');
  notesLines.push(`- **Version:** ${version}`);
  notesLines.push(`- **License:** ${lib.license} (full text: \`licenses/${licenseDestName}\`)`);
  notesLines.push(`- **Source:** ${lib.homepage}`);
  notesLines.push(`- **Vendored file:** \`${lib.to}\` (from \`${lib.from}\` in the npm package, unmodified)`);
  notesLines.push(`- **Notes:** ${lib.notes}`);
  notesLines.push('');
}

writeFileSync(join(vendorDir, 'THIRD_PARTY_NOTICES.md'), notesLines.join('\n'));
console.log(`\nWrote ${toolSlug}/vendor/THIRD_PARTY_NOTICES.md`);
