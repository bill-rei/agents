'use strict';

/**
 * @typedef {{ name: string, width: number, height: number, platform: string, layout: 'square'|'portrait'|'landscape'|'story', safeZone: { top: number, bottom: number } }} ImageSizeDef
 */

/** @type {ImageSizeDef[]} */
const IMAGE_SIZES = [
  {
    name: 'instagram-square-1080x1080.png',
    width: 1080, height: 1080,
    platform: 'instagram',
    layout: 'square',
    safeZone: { top: 0, bottom: 0 },
  },
  {
    name: 'instagram-portrait-1080x1350.png',
    width: 1080, height: 1350,
    platform: 'instagram',
    layout: 'portrait',
    safeZone: { top: 0, bottom: 0 },
  },
  {
    name: 'story-1080x1920.png',
    width: 1080, height: 1920,
    platform: 'instagram,facebook',
    layout: 'story',
    safeZone: { top: 250, bottom: 250 },
  },
  {
    name: 'linkedin-image-1200x627.png',
    width: 1200, height: 627,
    platform: 'linkedin',
    layout: 'landscape',
    safeZone: { top: 0, bottom: 0 },
  },
  {
    name: 'x-image-1600x900.png',
    width: 1600, height: 900,
    platform: 'x',
    layout: 'landscape',
    safeZone: { top: 0, bottom: 0 },
  },
  {
    name: 'threads-1440x1920.png',
    width: 1440, height: 1920,
    platform: 'threads',
    layout: 'portrait',
    safeZone: { top: 200, bottom: 200 },
  },
  {
    name: 'youtube-thumbnail-1280x720.png',
    width: 1280, height: 720,
    platform: 'youtube',
    layout: 'landscape',
    safeZone: { top: 0, bottom: 0 },
  },
];

/** @type {{ filename: string, platform: string, brandKey: string, variants: number }[]} */
const COPY_SPECS = [
  { filename: 'linkedin-llif.md',     platform: 'linkedin', brandKey: 'LLIF',     variants: 3 },
  { filename: 'linkedin-bestlife.md', platform: 'linkedin', brandKey: 'BestLife', variants: 3 },
  { filename: 'x-llif.md',           platform: 'x',        brandKey: 'LLIF',     variants: 5 },
  { filename: 'x-bestlife.md',       platform: 'x',        brandKey: 'BestLife', variants: 5 },
];

module.exports = { IMAGE_SIZES, COPY_SPECS };
