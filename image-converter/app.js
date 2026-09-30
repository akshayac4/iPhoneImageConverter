import config from './tool.config.js';
import * as converter from './converter.js';
import * as ui from './ui.js';

const MAX_SAFE_SIZE = 50 * 1024 * 1024; // 50MB, warn but don't block

const EXTENSIONS = { jpg: 'jpg', png: 'png', webp: 'webp' };

/** @type {Array<object>} */
let files = [];
let currentSettings = ui.getSettings();

function sanitizeBaseName(fileName) {
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const cleaned = base.replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned || 'image';
}

function outputFileName(originalName, outputFormat) {
  return `${sanitizeBaseName(originalName)}.${EXTENSIONS[outputFormat]}`;
}

function dedupeName(name, usedNames) {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let n = 1;
  let candidate;
  do {
    candidate = `${base} (${n})${ext}`;
    n++;
  } while (usedNames.has(candidate));
  usedNames.add(candidate);
  return candidate;
}

function findFile(id) {
  return files.find((f) => f.id === id);
}

function render() {
  ui.renderFileList(files, {
    onConvertOne: convertOne,
    onDownload: downloadOne,
    onRemove: removeFile,
  });
  const hasQueuedOrFailed = files.some((f) => f.status === 'queued' || f.status === 'failed');
  const hasDone = files.some((f) => f.status === 'done');
  ui.setBulkButtonsEnabled({
    convertAll: hasQueuedOrFailed,
    downloadZip: hasDone,
    clearAll: files.length > 0,
  });
}

async function handleFilesAdded(fileList) {
  const newItems = Array.from(fileList).map((file) => ({
    id: crypto.randomUUID(),
    file,
    format: null,
    status: 'queued',
    error: null,
    warning: file.size > MAX_SAFE_SIZE ? 'This file is over 50MB — conversion may be slow or use a lot of memory.' : null,
    thumbnailUrl: null,
    outputBlob: null,
    outputName: null,
    outputSize: null,
  }));
  files = files.concat(newItems);
  render();

  for (const item of newItems) {
    try {
      item.format = await converter.detectFormat(item.file);
      item.thumbnailUrl = URL.createObjectURL(await converter.createThumbnail(item.file, item.format));
    } catch (err) {
      // Thumbnail/format detection failing isn't fatal; conversion will surface a clearer error.
    }
    render();
  }
}

async function convertOne(id) {
  const item = findFile(id);
  if (!item || item.status === 'converting') return;

  item.status = 'converting';
  item.error = null;
  render();
  ui.announce(`Converting ${item.file.name}`);

  try {
    const format = item.format ?? (await converter.detectFormat(item.file));
    item.format = format;
    const result = await converter.convertFile(item.file, format, currentSettings);

    if (currentSettings.outputFormat === 'webp' && result.blob.type !== 'image/webp') {
      throw new converter.ConversionError('Your browser could not encode this image as WebP. Try JPG or PNG instead.');
    }

    item.status = 'done';
    item.outputBlob = result.blob;
    item.outputSize = result.blob.size;
    item.outputName = outputFileName(item.file.name, currentSettings.outputFormat);
    ui.announce(`${item.file.name} converted`);
  } catch (err) {
    item.status = 'failed';
    item.error = err instanceof converter.ConversionError ? err.message : "Something went wrong converting this file.";
    ui.announce(`${item.file.name} failed to convert`);
  }
  render();
}

async function convertAll() {
  const queue = files.filter((f) => f.status === 'queued' || f.status === 'failed');
  const total = queue.length;
  let done = 0;
  for (const item of queue) {
    done++;
    ui.setProgressText(`Converting ${done} of ${total}`);
    await convertOne(item.id);
    // Yield to the UI thread between files.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  ui.setProgressText('');
}

function removeFile(id) {
  const item = findFile(id);
  if (!item) return;
  if (item.thumbnailUrl) URL.revokeObjectURL(item.thumbnailUrl);
  files = files.filter((f) => f.id !== id);
  render();
}

function clearAll() {
  for (const item of files) {
    if (item.thumbnailUrl) URL.revokeObjectURL(item.thumbnailUrl);
  }
  files = [];
  render();
}

function downloadOne(id) {
  const item = findFile(id);
  if (!item || !item.outputBlob) return;
  const url = URL.createObjectURL(item.outputBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = item.outputName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadZip() {
  const done = files.filter((f) => f.status === 'done');
  if (done.length === 0) return;

  const JSZip = await converter.loadJSZip();
  const zip = new JSZip();
  const usedNames = new Set();
  for (const item of done) {
    const name = dedupeName(item.outputName, usedNames);
    zip.file(name, item.outputBlob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const date = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `converted-images-${date}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function getNoticesText() {
  try {
    const res = await fetch('./vendor/THIRD_PARTY_NOTICES.md');
    return await res.text();
  } catch (err) {
    return 'Could not load third-party notices.';
  }
}

function init() {
  document.title = config.meta.name;
  ui.initHeader(config);
  ui.initFooter(config);
  ui.initFaq();
  ui.initCta(config);

  ui.bindDropZone({ onFiles: handleFilesAdded });
  ui.bindSettings({ onChange: (settings) => { currentSettings = settings; } });
  ui.bindBulkActions({ onConvertAll: convertAll, onDownloadZip: downloadZip, onClearAll: clearAll });
  ui.bindCredits({ getNoticesText });

  converter.detectWebpEncodingSupport().then((supported) => {
    if (!supported) ui.disableWebpOption();
  });

  window.addEventListener('beforeunload', () => {
    for (const item of files) {
      if (item.thumbnailUrl) URL.revokeObjectURL(item.thumbnailUrl);
    }
  });

  render();
}

init();
