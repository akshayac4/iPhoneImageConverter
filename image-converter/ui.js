// DOM rendering and event wiring. Holds no conversion logic — it calls back
// into app.js, which owns state and talks to converter.js.

import { FAQ_ITEMS } from './faq-data.js';

const $ = (id) => document.getElementById(id);

const dropZone = $('drop-zone');
const fileInput = $('file-input');
const chooseFilesBtn = $('choose-files-btn');
const formatSelect = $('format-select');
const qualityField = $('quality-field');
const qualitySlider = $('quality-slider');
const qualityValue = $('quality-value');
const webpUnsupportedNote = $('webp-unsupported-note');
const maxWidthInput = $('max-width');
const maxHeightInput = $('max-height');
const convertAllBtn = $('convert-all-btn');
const downloadZipBtn = $('download-zip-btn');
const clearAllBtn = $('clear-all-btn');
const progressText = $('progress-text');
const fileListEl = $('file-list');
const emptyState = $('empty-state');
const statusLive = $('status-live');
const homeLink = $('home-link');
const homeLinkText = $('home-link-text');
const creditText = $('credit-text');
const creditsLink = $('credits-link');
const creditsDialog = $('credits-dialog');
const creditsContent = $('credits-content');
const creditsClose = $('credits-close');
const faqEl = $('faq');
const ctaSection = $('cta-section');
const ctaHeading = $('cta-heading');
const ctaText = $('cta-text');
const ctaButton = $('cta-button');

export function initHeader(config) {
  if (config.site.homeUrl) {
    homeLink.href = config.site.homeUrl;
    homeLinkText.textContent = config.site.siteName ? `← ${config.site.siteName}` : '← Home';
    homeLink.hidden = false;
  }
  $('tagline').textContent = config.meta.tagline;
}

export function initFooter(config) {
  if (config.credit.enabled) {
    if (config.credit.url) {
      const a = document.createElement('a');
      a.href = config.credit.url;
      a.textContent = config.credit.text;
      a.rel = 'noopener';
      creditText.appendChild(a);
    } else {
      creditText.textContent = config.credit.text;
    }
  } else {
    creditText.hidden = true;
  }
}

export function initCta(config) {
  if (!config.cta.enabled) return;
  ctaSection.hidden = false;
  ctaHeading.textContent = config.cta.heading;
  ctaText.textContent = config.cta.text;
  ctaButton.textContent = config.cta.buttonText;
  ctaButton.href = config.cta.url;
}

export function initFaq() {
  for (const item of FAQ_ITEMS) {
    const details = document.createElement('details');
    details.className = 'faq__item';
    const summary = document.createElement('summary');
    summary.textContent = item.q;
    const p = document.createElement('p');
    p.textContent = item.a;
    details.appendChild(summary);
    details.appendChild(p);
    faqEl.appendChild(details);
  }
}

export function bindDropZone({ onFiles }) {
  const openPicker = () => fileInput.click();
  chooseFilesBtn.addEventListener('click', openPicker);
  dropZone.addEventListener('click', (e) => {
    if (e.target === chooseFilesBtn) return;
    openPicker();
  });
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    }
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) onFiles(fileInput.files);
    fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add('is-dragover');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove('is-dragover');
    })
  );
  dropZone.addEventListener('drop', (e) => {
    const dropped = e.dataTransfer?.files;
    if (dropped && dropped.length) onFiles(dropped);
  });
}

export function getSettings() {
  const maxWidth = maxWidthInput.value ? parseInt(maxWidthInput.value, 10) : null;
  const maxHeight = maxHeightInput.value ? parseInt(maxHeightInput.value, 10) : null;
  return {
    outputFormat: formatSelect.value,
    quality: parseInt(qualitySlider.value, 10),
    resize: maxWidth || maxHeight ? { maxWidth, maxHeight } : null,
  };
}

export function bindSettings({ onChange }) {
  const updateQualityVisibility = () => {
    qualityField.hidden = formatSelect.value === 'png';
  };
  updateQualityVisibility();

  formatSelect.addEventListener('change', () => {
    updateQualityVisibility();
    onChange(getSettings());
  });
  qualitySlider.addEventListener('input', () => {
    qualityValue.textContent = qualitySlider.value;
    onChange(getSettings());
  });
  maxWidthInput.addEventListener('change', () => onChange(getSettings()));
  maxHeightInput.addEventListener('change', () => onChange(getSettings()));
}

export function disableWebpOption() {
  const webpOption = formatSelect.querySelector('option[value="webp"]');
  if (webpOption) webpOption.disabled = true;
  webpUnsupportedNote.hidden = false;
}

export function bindBulkActions({ onConvertAll, onDownloadZip, onClearAll }) {
  convertAllBtn.addEventListener('click', onConvertAll);
  downloadZipBtn.addEventListener('click', onDownloadZip);
  clearAllBtn.addEventListener('click', onClearAll);
}

export function bindCredits({ getNoticesText }) {
  creditsLink.addEventListener('click', async () => {
    creditsContent.textContent = 'Loading…';
    creditsDialog.showModal();
    creditsContent.textContent = await getNoticesText();
  });
  creditsClose.addEventListener('click', () => creditsDialog.close());
}

export function announce(message) {
  statusLive.textContent = message;
}

export function setProgressText(text) {
  progressText.textContent = text;
}

export function setBulkButtonsEnabled({ convertAll, downloadZip, clearAll }) {
  convertAllBtn.disabled = !convertAll;
  downloadZipBtn.disabled = !downloadZip;
  clearAllBtn.disabled = !clearAll;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

const STATUS_LABEL = {
  queued: 'Queued',
  converting: 'Converting…',
  done: 'Done',
  failed: 'Failed',
};

function renderFileCard(item, handlers) {
  const li = document.createElement('li');
  li.className = 'file-card';
  li.dataset.id = item.id;

  let thumb;
  if (item.thumbnailUrl) {
    thumb = document.createElement('img');
    thumb.className = 'file-card__thumb';
    thumb.src = item.thumbnailUrl;
    thumb.alt = '';
  } else {
    thumb = document.createElement('div');
    thumb.className = 'file-card__thumb file-card__thumb--placeholder';
    thumb.textContent = (item.format || '?').toUpperCase().slice(0, 4);
  }

  const info = document.createElement('div');
  info.className = 'file-card__info';

  const name = document.createElement('div');
  name.className = 'file-card__name';
  name.title = item.file.name;
  name.textContent = item.file.name;

  const meta = document.createElement('div');
  meta.className = 'file-card__meta';

  const badge = document.createElement('span');
  badge.className = `status-badge status-badge--${item.status}`;
  badge.textContent = STATUS_LABEL[item.status];

  const size = document.createElement('span');
  size.textContent = item.status === 'done' && item.outputSize != null
    ? `${formatBytes(item.file.size)} → ${formatBytes(item.outputSize)}`
    : formatBytes(item.file.size);

  meta.appendChild(badge);
  meta.appendChild(size);

  info.appendChild(name);
  info.appendChild(meta);

  if (item.error) {
    const err = document.createElement('p');
    err.className = 'file-card__error';
    err.textContent = item.error;
    info.appendChild(err);
  } else if (item.warning) {
    const warn = document.createElement('p');
    warn.className = 'file-card__warning';
    warn.textContent = item.warning;
    info.appendChild(warn);
  }

  const actions = document.createElement('div');
  actions.className = 'file-card__actions';

  if (item.status === 'done') {
    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'button button--small';
    downloadBtn.textContent = 'Download';
    downloadBtn.addEventListener('click', () => handlers.onDownload(item.id));
    actions.appendChild(downloadBtn);
  } else if (item.status === 'queued' || item.status === 'failed') {
    const convertBtn = document.createElement('button');
    convertBtn.type = 'button';
    convertBtn.className = 'button button--small';
    convertBtn.textContent = item.status === 'failed' ? 'Retry' : 'Convert';
    convertBtn.addEventListener('click', () => handlers.onConvertOne(item.id));
    actions.appendChild(convertBtn);
  }

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'button button--small button--ghost';
  removeBtn.textContent = 'Remove';
  removeBtn.setAttribute('aria-label', `Remove ${item.file.name}`);
  removeBtn.addEventListener('click', () => handlers.onRemove(item.id));
  actions.appendChild(removeBtn);

  li.appendChild(thumb);
  li.appendChild(info);
  li.appendChild(actions);
  return li;
}

export function renderFileList(items, handlers) {
  fileListEl.innerHTML = '';
  emptyState.classList.toggle('is-hidden', items.length > 0);
  for (const item of items) {
    fileListEl.appendChild(renderFileCard(item, handlers));
  }
}
