'use strict';

/**
 * Canonical output size map for Brand Asset Compiler.
 *
 * @typedef {{ name: string, width: number, height: number, category: 'favicon'|'social'|'canva', transparent?: boolean, isOG?: boolean }} SizeDef
 */

/** @type {SizeDef[]} */
const FAVICON_SIZES = [
  { name: 'favicon-32x32.png',    width: 32,  height: 32,  category: 'favicon', transparent: true  },
  { name: 'apple-touch-icon.png', width: 180, height: 180, category: 'favicon', transparent: false },
  { name: 'icon-192.png',         width: 192, height: 192, category: 'favicon', transparent: true  },
  { name: 'icon-512.png',         width: 512, height: 512, category: 'favicon', transparent: true  },
  { name: 'site-icon-512.png',    width: 512, height: 512, category: 'favicon', transparent: false },
];

/** @type {SizeDef[]} */
const SOCIAL_SIZES = [
  { name: 'og-default-1200x630.png',      width: 1200, height: 630,  category: 'social', isOG: true },
  { name: 'profile-master-800.png',       width: 800,  height: 800,  category: 'social'             },
  { name: 'x-banner-1500x500.png',        width: 1500, height: 500,  category: 'social'             },
  { name: 'linkedin-cover-4200x700.png',  width: 4200, height: 700,  category: 'social'             },
  { name: 'facebook-cover-851x315.png',   width: 851,  height: 315,  category: 'social'             },
  { name: 'youtube-banner-2560x1440.png', width: 2560, height: 1440, category: 'social'             },
];

/** @type {SizeDef[]} */
const CANVA_LOGO_SIZES = [
  { name: 'logo-2048.png', width: 2048, height: 2048, category: 'canva', transparent: true },
  { name: 'logo-1024.png', width: 1024, height: 1024, category: 'canva', transparent: true },
];

const ALL_SIZES = [...FAVICON_SIZES, ...SOCIAL_SIZES, ...CANVA_LOGO_SIZES];

module.exports = { FAVICON_SIZES, SOCIAL_SIZES, CANVA_LOGO_SIZES, ALL_SIZES };
