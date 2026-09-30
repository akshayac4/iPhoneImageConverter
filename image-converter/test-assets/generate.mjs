#!/usr/bin/env node
// Generates synthetic test fixtures for manual/automated testing.
// The baseline JPEG and WebP files were produced separately via a real
// browser canvas (see README note below) since hand-rolling JPEG/WebP
// encoders isn't practical; everything else is built here from scratch
// with only Node's built-in modules (zero dependencies).
//
// Usage: node generate.mjs

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';

const dir = dirname(fileURLToPath(import.meta.url));

// --- Minimal PNG with a semi-transparent circle (RGBA, filter-none rows) ---

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function buildTransparentPng(width, height) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const dx = x - width / 2, dy = y - height / 2;
      const inCircle = dx * dx + dy * dy <= (width * 0.44) ** 2;
      const off = rowStart + 1 + x * 4;
      if (inCircle) {
        raw[off] = 37; raw[off + 1] = 99; raw[off + 2] = 235; raw[off + 3] = 153; // ~60% alpha blue
      } else {
        raw[off] = 0; raw[off + 1] = 0; raw[off + 2] = 0; raw[off + 3] = 0; // fully transparent
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(join(dir, 'transparent.png'), buildTransparentPng(64, 64));
console.log('wrote transparent.png (64x64, semi-transparent circle)');

// --- EXIF orientation injection into the browser-generated baseline JPEG ---

function buildExifOrientationSegment(orientation) {
  // Minimal TIFF structure (big-endian) with a single IFD0 entry: Orientation (0x0112, SHORT).
  const tiff = Buffer.alloc(8 + 2 + 12 + 4);
  tiff.write('MM', 0, 'ascii');
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4); // offset to IFD0
  tiff.writeUInt16BE(1, 8); // 1 entry
  tiff.writeUInt16BE(0x0112, 10); // Orientation tag
  tiff.writeUInt16BE(3, 12); // type SHORT
  tiff.writeUInt32BE(1, 14); // count
  tiff.writeUInt16BE(orientation, 18); // value (in first 2 bytes of the 4-byte value field)
  tiff.writeUInt32BE(0, 20); // next IFD offset

  const exifHeader = Buffer.from('Exif\0\0', 'ascii');
  const payload = Buffer.concat([exifHeader, tiff]);
  const segment = Buffer.alloc(2 + 2 + payload.length);
  segment.writeUInt16BE(0xffe1, 0); // APP1 marker
  segment.writeUInt16BE(2 + payload.length, 2); // segment length (excludes the marker itself)
  payload.copy(segment, 4);
  return segment;
}

function injectExifOrientation(inputPath, outputPath, orientation) {
  const jpeg = readFileSync(inputPath);
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Not a valid JPEG (missing SOI marker)');
  const app1 = buildExifOrientationSegment(orientation);
  const out = Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
  writeFileSync(outputPath, out);
}

const baselineJpegPath = join(dir, 'baseline-for-exif.jpg');
if (existsSync(baselineJpegPath)) {
  injectExifOrientation(baselineJpegPath, join(dir, 'exif-orientation-6.jpg'), 6);
  unlinkSync(baselineJpegPath);
  console.log('wrote exif-orientation-6.jpg (80x40 upright, tagged to display as 40x80)');
} else {
  console.warn('Skipped exif-orientation-6.jpg: baseline-for-exif.jpg not found (generate it via a browser canvas first).');
}

// --- Minimal uncompressed multi-page TIFF (2 pages, RGB, no compression) ---

function buildTiffPage(width, height, rgb, isFirst) {
  const pixelData = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    pixelData[i * 3] = rgb[0];
    pixelData[i * 3 + 1] = rgb[1];
    pixelData[i * 3 + 2] = rgb[2];
  }

  const tags = [
    [0x0100, 3, 1, width], // ImageWidth
    [0x0101, 3, 1, height], // ImageLength
    [0x0102, 3, 3, null], // BitsPerSample (offset filled in below; 3 SHORTs = 8,8,8)
    [0x0103, 3, 1, 1], // Compression = none
    [0x0106, 3, 1, 2], // PhotometricInterpretation = RGB
    [0x0111, 4, 1, null], // StripOffsets (filled in below)
    [0x0115, 3, 1, 3], // SamplesPerPixel
    [0x0116, 3, 1, height], // RowsPerStrip
    [0x0117, 4, 1, pixelData.length], // StripByteCounts
    [0x011c, 3, 1, 1], // PlanarConfiguration = chunky
  ];

  const ifdEntryCount = tags.length;
  const ifdSize = 2 + ifdEntryCount * 12 + 4;
  const bitsPerSampleOffset = 8 + ifdSize; // extra data lives right after this page's IFD
  const stripOffset = bitsPerSampleOffset + 6; // 3 x SHORT = 6 bytes

  const ifd = Buffer.alloc(ifdSize);
  ifd.writeUInt16LE(ifdEntryCount, 0);
  tags.forEach(([tag, type, count, value], i) => {
    const off = 2 + i * 12;
    ifd.writeUInt16LE(tag, off);
    ifd.writeUInt16LE(type, off + 2);
    ifd.writeUInt32LE(count, off + 4);
    if (tag === 0x0102) ifd.writeUInt32LE(bitsPerSampleOffset, off + 8);
    else if (tag === 0x0111) ifd.writeUInt32LE(stripOffset, off + 8);
    else ifd.writeUInt32LE(value, off + 8);
  });
  // next-IFD offset placeholder (patched by caller once page order is known)
  ifd.writeUInt32LE(0, ifdSize - 4);

  const bitsPerSample = Buffer.alloc(6);
  bitsPerSample.writeUInt16LE(8, 0);
  bitsPerSample.writeUInt16LE(8, 2);
  bitsPerSample.writeUInt16LE(8, 4);

  const extra = Buffer.concat([bitsPerSample, pixelData]);
  return { ifd, extra, ifdSize };
}

function buildMultiPageTiff(pages) {
  const header = Buffer.alloc(8);
  header.write('II', 0, 'ascii');
  header.writeUInt16LE(42, 2);

  let offset = 8;
  const built = pages.map((p) => {
    const page = buildTiffPage(p.width, p.height, p.rgb);
    const ifdOffset = offset;
    offset += page.ifd.length;
    const extraOffset = offset;
    offset += page.extra.length;
    return { ...page, ifdOffset, extraOffset };
  });

  // Patch each IFD's data offsets (relative to file start) and next-IFD chain.
  const chunks = [];
  built.forEach((page, i) => {
    const bitsPerSampleAbsOffset = page.extraOffset;
    const stripAbsOffset = page.extraOffset + 6;
    for (let e = 0; e < (page.ifd.readUInt16LE(0)); e++) {
      const off = 2 + e * 12;
      const tag = page.ifd.readUInt16LE(off);
      if (tag === 0x0102) page.ifd.writeUInt32LE(bitsPerSampleAbsOffset, off + 8);
      if (tag === 0x0111) page.ifd.writeUInt32LE(stripAbsOffset, off + 8);
    }
    const nextIfdOffset = i < built.length - 1 ? built[i + 1].ifdOffset : 0;
    page.ifd.writeUInt32LE(nextIfdOffset, page.ifd.length - 4);
    chunks.push(page.ifd, page.extra);
  });

  header.writeUInt32LE(built[0].ifdOffset, 4);
  return Buffer.concat([header, ...chunks]);
}

const tiff = buildMultiPageTiff([
  { width: 16, height: 12, rgb: [220, 38, 38] }, // page 1: red
  { width: 16, height: 12, rgb: [37, 99, 235] }, // page 2: blue
]);
writeFileSync(join(dir, 'multipage.tiff'), tiff);
console.log('wrote multipage.tiff (2 pages, 16x12, uncompressed RGB)');

// --- Minimal single-image GIF89a (4-color palette, simple LZW encoding) ---

function lzwEncodeGif(indices, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let dict = new Map();
  const resetDict = () => {
    dict = new Map();
    for (let i = 0; i < clearCode; i++) dict.set(String(i), i);
    return clearCode + 2;
  };
  let nextCode = resetDict();

  const bytes = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const emit = (code) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bytes.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  emit(clearCode);
  let current = String(indices[0]);
  for (let i = 1; i < indices.length; i++) {
    const next = String(indices[i]);
    const combined = `${current},${next}`;
    if (dict.has(combined)) {
      current = combined;
    } else {
      emit(dict.get(current));
      if (nextCode < 4096) {
        dict.set(combined, nextCode++);
        if (nextCode - 1 === (1 << codeSize) && codeSize < 12) codeSize++;
      } else {
        emit(clearCode);
        nextCode = resetDict();
        codeSize = minCodeSize + 1;
      }
      current = next;
    }
  }
  emit(dict.get(current));
  emit(endCode);
  if (bitCount > 0) bytes.push(bitBuffer & 0xff);
  return Buffer.from(bytes);
}

function buildGif(width, height, palette, indices) {
  const header = Buffer.from('GIF89a', 'ascii');

  const gct = Buffer.alloc(palette.length * 3);
  palette.forEach(([r, g, b], i) => {
    gct[i * 3] = r; gct[i * 3 + 1] = g; gct[i * 3 + 2] = b;
  });
  const colorBits = Math.max(2, Math.ceil(Math.log2(palette.length)));

  const logicalScreenDescriptor = Buffer.alloc(7);
  logicalScreenDescriptor.writeUInt16LE(width, 0);
  logicalScreenDescriptor.writeUInt16LE(height, 2);
  logicalScreenDescriptor[4] = 0b10000000 | ((colorBits - 1) << 4) | (colorBits - 1); // has GCT, color resolution, GCT size
  logicalScreenDescriptor[5] = 0; // background color index
  logicalScreenDescriptor[6] = 0; // pixel aspect ratio

  const imageDescriptor = Buffer.alloc(10);
  imageDescriptor[0] = 0x2c; // Image Separator
  imageDescriptor.writeUInt16LE(0, 1); // left
  imageDescriptor.writeUInt16LE(0, 3); // top
  imageDescriptor.writeUInt16LE(width, 5);
  imageDescriptor.writeUInt16LE(height, 7);
  imageDescriptor[9] = 0; // no local color table, not interlaced

  const minCodeSize = Math.max(2, colorBits);
  const lzwData = lzwEncodeGif(indices, minCodeSize);

  const dataSubBlocks = [];
  for (let i = 0; i < lzwData.length; i += 255) {
    const chunk = lzwData.subarray(i, i + 255);
    dataSubBlocks.push(Buffer.from([chunk.length]), chunk);
  }
  dataSubBlocks.push(Buffer.from([0])); // block terminator

  return Buffer.concat([
    header,
    logicalScreenDescriptor,
    gct,
    imageDescriptor,
    Buffer.from([minCodeSize]),
    ...dataSubBlocks,
    Buffer.from([0x3b]), // trailer
  ]);
}

const gifWidth = 20;
const gifHeight = 20;
const palette = [
  [255, 255, 255],
  [22, 163, 74],
  [37, 99, 235],
  [220, 38, 38],
];
const gifIndices = new Array(gifWidth * gifHeight).fill(0).map((_, i) => {
  const x = i % gifWidth;
  const y = Math.floor(i / gifWidth);
  if (x < gifWidth / 2 && y < gifHeight / 2) return 1;
  if (x >= gifWidth / 2 && y < gifHeight / 2) return 2;
  if (x < gifWidth / 2 && y >= gifHeight / 2) return 3;
  return 0;
});
writeFileSync(join(dir, 'sample.gif'), buildGif(gifWidth, gifHeight, palette, gifIndices));
console.log('wrote sample.gif (20x20, 4-color quadrants)');

// --- Corrupted "HEIC" (random bytes, wrong extension on purpose) ---

writeFileSync(join(dir, 'corrupted.heic'), randomBytes(4096));
console.log('wrote corrupted.heic (random bytes, should fail to decode cleanly)');

console.log('\nNote: exif-orientation-6.jpg and sample.webp start from a real browser canvas');
console.log('(hand-rolling JPEG/WebP encoders is not practical) — see this folder\'s README');
console.log('for how baseline-for-exif.jpg and sample.webp were produced before this script runs.');
