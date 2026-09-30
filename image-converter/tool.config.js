// Single source of truth for everything that changes between hosts.
// Rebranding = edit theme.css. Settings/text/host changes = edit this file. Then rebuild.
export default {
  slug: 'image-converter',
  version: '1.0.0',

  meta: {
    name: 'Image Converter',
    tagline: 'Convert HEIC, JPG, PNG, WebP & TIFF privately in your browser',
    description:
      'Free, private image converter. Convert HEIC, JPG, PNG, WebP and TIFF files in your browser — nothing is ever uploaded.',
    audience: 'consumer',
    category: 'files-and-media',
    tags: ['heic', 'jpg', 'png', 'webp', 'tiff', 'image', 'converter', 'privacy'],
    status: 'in-development',
    screenshot: 'assets/screenshot.png',
  },

  site: {
    siteName: '',
    canonicalUrl: '',
    homeUrl: '',
    ogImage: 'assets/og.png',
  },

  credit: {
    enabled: true,
    text: 'Built by CAD Labs Technology LLP',
    url: 'https://www.thecadlabs.com/',
  },

  cta: {
    enabled: false,
    heading: '',
    text: '',
    buttonText: '',
    url: '',
  },

  analytics: {
    enabled: false,
  },
};
