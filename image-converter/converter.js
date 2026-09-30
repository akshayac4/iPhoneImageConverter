// Decode/encode pipeline. No DOM code here so this stays reusable
// (e.g. movable into a Web Worker later).

export class ConversionError extends Error {}

const scriptPromises = new Map();

function loadScript(src) {
  if (!scriptPromises.has(src)) {
    scriptPromises.set(
      src,
      new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new ConversionError(`Failed to load ${src}`));
        document.head.appendChild(script);
      })
    );
  }
  return scriptPromises.get(src);
}

let heicModulePromise = null;
function loadHeicTo() {
  if (!heicModulePromise) {
    heicModulePromise = import('./vendor/heic-to.js');
  }
  return heicModulePromise;
}

let utifLoadPromise = null;
function loadUtif() {
  if (!utifLoadPromise) {
    // pako must be present as a global before UTIF.js runs.
    utifLoadPromise = loadScript('./vendor/pako.min.js').then(() => loadScript('./vendor/UTIF.js'));
  }
  return utifLoadPromise;
}

let jszipLoadPromise = null;
export function loadJSZip() {
  if (!jszipLoadPromise) {
    jszipLoadPromise = loadScript('./vendor/jszip.min.js').then(() => window.JSZip);
  }
  return jszipLoadPromise;
}

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);

async function readBytes(file, length) {
  const buffer = await file.slice(0, length).arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Sniffs the file's real format from its contents where possible, falling
 * back to the file extension. Returns one of: 'heic', 'tiff', 'png', 'jpeg',
 * 'webp', 'gif', 'bmp', 'avif', or 'unknown'.
 */
export async function detectFormat(file) {
  const head = await readBytes(file, 32);
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  // PNG: 89 50 4E 47
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'png';
  // JPEG: FF D8 FF
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  // GIF: GIF87a / GIF89a
  if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return 'gif';
  // BMP: BM
  if (head[0] === 0x42 && head[1] === 0x4d) return 'bmp';
  // TIFF: II*\0 (little-endian) or MM\0* (big-endian)
  if ((head[0] === 0x49 && head[1] === 0x49 && head[2] === 0x2a && head[3] === 0x00) ||
      (head[0] === 0x4d && head[1] === 0x4d && head[2] === 0x00 && head[3] === 0x2a)) {
    return 'tiff';
  }
  // RIFF....WEBP or ....AVIF live in an ISO-BMFF/RIFF container.
  if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
      head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) {
    return 'webp';
  }
  // ISO-BMFF (HEIC/HEIF/AVIF): box at offset 4 is 'ftyp', brand at offset 8.
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    const brand = String.fromCharCode(head[8], head[9], head[10], head[11]).toLowerCase();
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (HEIC_BRANDS.has(brand)) return 'heic';
  }

  // Fall back to extension when content sniffing is inconclusive.
  if (ext === 'heic' || ext === 'heif') return 'heic';
  if (ext === 'tif' || ext === 'tiff') return 'tiff';
  if (ext === 'avif') return 'avif';
  return 'unknown';
}

function tiffToImageData(buffer) {
  const ifds = window.UTIF.decode(buffer);
  if (!ifds || ifds.length === 0) throw new ConversionError('This TIFF file has no readable pages.');
  const firstPage = ifds[0];
  window.UTIF.decodeImage(buffer, firstPage);
  const rgba = window.UTIF.toRGBA8(firstPage);
  return new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length), firstPage.width, firstPage.height);
}

async function decodeTiff(file) {
  await loadUtif();
  const buffer = await file.arrayBuffer();
  let imageData;
  try {
    imageData = tiffToImageData(buffer);
  } catch (err) {
    throw new ConversionError("This TIFF file couldn't be decoded. It may be corrupted or use an unsupported compression scheme.");
  }
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext('2d').putImageData(imageData, 0, 0);
  return createImageBitmap(canvas);
}

async function decodeHeic(file) {
  const { heicTo } = await loadHeicTo();
  try {
    return await heicTo({ blob: file, type: 'bitmap' });
  } catch (err) {
    throw new ConversionError("This file couldn't be read. It may be corrupted or an unsupported HEIC variant.");
  }
}

async function decodeNative(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (err) {
    throw new ConversionError('This file could not be read as an image. It may be corrupted or in an unsupported format.');
  }
}

/** Decodes any supported input file to an ImageBitmap. */
export async function decodeToBitmap(file, format) {
  if (format === 'heic') return decodeHeic(file);
  if (format === 'tiff') return decodeTiff(file);
  return decodeNative(file);
}

/** Computes output dimensions that fit within maxWidth/maxHeight, preserving aspect ratio and never upscaling. */
export function computeResizedDimensions(width, height, maxWidth, maxHeight) {
  let scale = 1;
  if (maxWidth && width > maxWidth) scale = Math.min(scale, maxWidth / width);
  if (maxHeight && height > maxHeight) scale = Math.min(scale, maxHeight / height);
  if (scale >= 1) return { width, height };
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function makeCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasToBlob(canvas, type, quality) {
  if (canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new ConversionError('Encoding failed.'))), type, quality);
  });
}

const MIME_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * Runs the full pipeline for one file: decode -> optional resize -> draw -> encode.
 * options: { outputFormat: 'jpg'|'png'|'webp', quality: 10-100, resize: {maxWidth, maxHeight} | null }
 */
export async function convertFile(file, format, options) {
  const bitmap = await decodeToBitmap(file, format);
  try {
    const { width, height } = options.resize
      ? computeResizedDimensions(bitmap.width, bitmap.height, options.resize.maxWidth, options.resize.maxHeight)
      : { width: bitmap.width, height: bitmap.height };

    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const mimeType = MIME_TYPES[options.outputFormat];
    if (mimeType === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    const quality = mimeType === 'image/png' ? undefined : options.quality / 100;
    const blob = await canvasToBlob(canvas, mimeType, quality);
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}

/** Generates a small thumbnail blob (max ~200px) for the file list UI. */
export async function createThumbnail(file, format, maxSize = 200) {
  const bitmap = await decodeToBitmap(file, format);
  try {
    const { width, height } = computeResizedDimensions(bitmap.width, bitmap.height, maxSize, maxSize);
    const canvas = makeCanvas(Math.max(1, width), Math.max(1, height));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvasToBlob(canvas, 'image/jpeg', 0.8);
  } finally {
    bitmap.close();
  }
}

/** Feature-tests real WebP encoding support (Safari can silently return PNG instead). */
export async function detectWebpEncodingSupport() {
  try {
    const canvas = makeCanvas(1, 1);
    canvas.getContext('2d').fillRect(0, 0, 1, 1);
    const blob = await canvasToBlob(canvas, 'image/webp', 0.8);
    return blob.type === 'image/webp';
  } catch (err) {
    return false;
  }
}
