// Shared between ui.js (renders it) and scripts/build.mjs (emits matching
// FAQPage JSON-LD). No DOM code, so it's safe to import from Node too.
export const FAQ_ITEMS = [
  {
    q: 'Are my photos uploaded anywhere?',
    a: 'No. Every conversion runs locally in your browser using JavaScript and WebAssembly. Your files are never sent over the network — you can even disconnect from the internet after the page has loaded and conversion will keep working.',
  },
  {
    q: 'How do I convert HEIC to JPG?',
    a: 'Drag your HEIC or HEIF photos into the drop zone (or choose them from your device), make sure "JPG" is selected as the output format, then press Convert. Each photo can be downloaded on its own or as part of a ZIP once it’s done.',
  },
  {
    q: 'Does converting reduce image quality?',
    a: 'JPG and WebP use adjustable, lossy compression — higher quality settings keep more detail but produce larger files. PNG output is always lossless. Resizing to a smaller resolution will also reduce detail, since it’s optional and off by default.',
  },
  {
    q: 'Is there a file limit?',
    a: 'There’s no hard limit, but very large files (over 50MB) use a lot of memory, especially on phones, so you’ll see a warning for those. Files are converted one at a time to keep the page responsive during large batches.',
  },
  {
    q: 'Why is WebP unavailable in my browser?',
    a: 'A few browsers, notably some versions of Safari, don’t support encoding WebP images from a canvas. This tool detects that automatically and disables the WebP option with a note when it happens — JPG and PNG are unaffected.',
  },
  {
    q: 'Is location data removed?',
    a: 'Yes. Redrawing an image onto a canvas and re-encoding it, which is how this tool works, does not carry over EXIF metadata such as GPS coordinates or camera details — the converted file won’t include it.',
  },
];
