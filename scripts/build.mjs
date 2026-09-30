#!/usr/bin/env node
// Builds a tool folder into dist/<slug>/: a fully static, path-independent
// deployable copy with SEO head tags injected from tool.config.js.
//
// Usage: node scripts/build.mjs <tool-slug>

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  rmSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const toolSlug = process.argv[2];

if (!toolSlug) {
  console.error('Usage: npm run build -- <tool-slug>');
  process.exit(1);
}

const toolDir = join(repoRoot, toolSlug);
const outDir = join(repoRoot, 'dist', toolSlug);

if (!existsSync(toolDir)) {
  console.error(`Tool folder not found: ${toolSlug}`);
  process.exit(1);
}

const { default: config } = await import(pathToFileURL(join(toolDir, 'tool.config.js')));
const { FAQ_ITEMS } = await import(pathToFileURL(join(toolDir, 'faq-data.js')));

// --- 1. Copy the tool folder into dist, excluding dev-only paths ---

const EXCLUDE_TOP_LEVEL = new Set(['test-assets', 'dist', 'node_modules']);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

function copyTree(src, dest) {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (dest === outDir && EXCLUDE_TOP_LEVEL.has(entry.name)) continue;
    if (/^readme\.md$/i.test(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;

    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      copyTree(srcPath, destPath);
    } else {
      cpSync(srcPath, destPath);
    }
  }
}

copyTree(toolDir, outDir);

// --- 2. Cache-bust the tool's own JS/CSS (not vendor/, which is versioned by npm) ---

function versionizeOwnReferences(content, version) {
  return content.replace(/(["'])(\.\/(?!vendor\/)[\w.-]+\.(?:js|css))\1/g, `$1$2?v=${version}$1`);
}

for (const file of ['app.js', 'ui.js', 'converter.js']) {
  const p = join(outDir, file);
  if (existsSync(p)) writeFileSync(p, versionizeOwnReferences(readFileSync(p, 'utf8'), config.version));
}

// --- 3. Build SEO head tags ---

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function resolveUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  if (!config.site.canonicalUrl) return path;
  return new URL(path, config.site.canonicalUrl).toString();
}

const title = config.site.siteName
  ? `Free Image Converter – HEIC to JPG, PNG, WebP | ${config.site.siteName}`
  : 'Free Image Converter – HEIC to JPG, PNG, WebP';

const description = config.meta.description;
const ogImageUrl = resolveUrl(config.site.ogImage);

const webApplicationLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: config.meta.name,
  description,
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Any (runs in a web browser)',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};
if (config.site.canonicalUrl) webApplicationLd.url = config.site.canonicalUrl;

const faqPageLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ITEMS.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

const headLines = [];
headLines.push(`<title>${escapeHtml(title)}</title>`);
headLines.push(`<meta name="description" content="${escapeHtml(description)}">`);

if (config.site.canonicalUrl) {
  headLines.push(`<link rel="canonical" href="${escapeHtml(config.site.canonicalUrl)}">`);
} else {
  headLines.push('<meta name="robots" content="noindex">');
}

headLines.push(`<meta property="og:type" content="website">`);
headLines.push(`<meta property="og:title" content="${escapeHtml(config.meta.name)}">`);
headLines.push(`<meta property="og:description" content="${escapeHtml(description)}">`);
if (config.site.canonicalUrl) headLines.push(`<meta property="og:url" content="${escapeHtml(config.site.canonicalUrl)}">`);
if (ogImageUrl) headLines.push(`<meta property="og:image" content="${escapeHtml(ogImageUrl)}">`);

headLines.push(`<meta name="twitter:card" content="summary_large_image">`);
headLines.push(`<meta name="twitter:title" content="${escapeHtml(config.meta.name)}">`);
headLines.push(`<meta name="twitter:description" content="${escapeHtml(description)}">`);
if (ogImageUrl) headLines.push(`<meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">`);

headLines.push(`<script type="application/ld+json">${JSON.stringify(webApplicationLd)}</script>`);
headLines.push(`<script type="application/ld+json">${JSON.stringify(faqPageLd)}</script>`);

// --- 4. Inject head tags and version query strings into index.html ---

const indexPath = join(outDir, 'index.html');
let html = readFileSync(indexPath, 'utf8');
html = html.replace('<!-- @@HEAD_META@@ -->', headLines.join('\n'));
html = html.replace(/(src|href)="(\.\/(?:app\.js|theme\.css|styles\.css))"/g, `$1="$2?v=${config.version}"`);
writeFileSync(indexPath, html);

// --- 5. Write tool.json for the future showcase site ---

writeFileSync(
  join(outDir, 'tool.json'),
  JSON.stringify({ slug: config.slug, version: config.version, ...config.meta }, null, 2)
);

// --- Report ---

function countFiles(dir) {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count += countFiles(join(dir, entry.name));
    else count++;
  }
  return count;
}

console.log(`Built ${toolSlug} -> dist/${toolSlug}/ (${countFiles(outDir)} files)`);
