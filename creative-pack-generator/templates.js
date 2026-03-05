'use strict';

// ── SVG template builder for creative pack images ─────────────────────────────
//
// Approach: build an SVG string per image size, then render via @resvg/resvg-js.
// The SVG embeds the brand logo as a base64 data URI so resvg resolves it fully
// without any external file references.

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Determine a readable text colour for a given hex background.
 */
function contrastColor(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#111111' : '#ffffff';
}

/**
 * Return a slightly lighter/darker shade of a hex color for accents.
 */
function accentColor(hex, textCol) {
  // If white text on dark bg → lighten bg slightly for accent
  // If dark text on light bg → use a mid-grey accent
  return textCol === '#ffffff' ? '#ffffff33' : '#00000022';
}

/**
 * Wrap text into lines, each ≤ maxChars characters.
 */
function wrapText(text, maxChars) {
  if (!text) return [];
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      // Handle single words longer than maxChars
      current = word.length > maxChars ? word.slice(0, maxChars) : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Build multi-line tspan elements for an SVG <text> element.
 * Returns { tspans: string, totalHeight: number }
 */
function buildTspans(lines, x, startY, lineHeight, limit = 3) {
  const capped = lines.slice(0, limit);
  const tspans = capped
    .map((line, i) =>
      i === 0
        ? `<tspan x="${x}" y="${startY}">${escapeXml(line)}</tspan>`
        : `<tspan x="${x}" dy="${lineHeight}">${escapeXml(line)}</tspan>`
    )
    .join('');
  return { tspans, totalHeight: capped.length * lineHeight };
}

/**
 * Compute headline font size from image dimensions.
 * Uses geometric mean normalised to a 1080p reference.
 * Clamped between 44 and 96 px.
 */
function headlineFontSize(width, height) {
  const geoMean = Math.sqrt(width * height);
  const raw = (geoMean / 1080) * 72;
  return Math.min(96, Math.max(44, Math.round(raw)));
}

/**
 * Build the complete SVG string for a single creative image.
 *
 * @param {object} opts
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {'square'|'portrait'|'landscape'|'story'} opts.layout
 * @param {{ top: number, bottom: number }} opts.safeZone
 * @param {string} opts.bgColor      hex, e.g. '#1a1a2e'
 * @param {string} opts.headline     campaign title (1-2 lines)
 * @param {string} [opts.subhead]    key message (2-3 lines)
 * @param {string} [opts.cta]        call-to-action text
 * @param {string} [opts.logoBase64] PNG base64 string (no prefix)
 */
function buildImageSvg(opts) {
  const {
    width, height, layout, safeZone = { top: 0, bottom: 0 },
    bgColor = '#ffffff', headline, subhead, cta, logoBase64,
  } = opts;

  const textColor  = contrastColor(bgColor);
  const pad        = Math.round(Math.min(width, height) * 0.07); // ~7% of short side
  const hSize      = headlineFontSize(width, height);
  const shSize     = Math.round(hSize * 0.52);
  const ctaSize    = Math.round(hSize * 0.38);
  const lineH      = Math.round(hSize * 1.22);
  const shLineH    = Math.round(shSize * 1.30);

  // Logo dimensions: ~14% of shorter side, max 220px
  const logoMaxDim = Math.min(220, Math.round(Math.min(width, height) * 0.14));
  const logoPad    = Math.round(pad * 0.9);
  const logoX      = width  - logoMaxDim - logoPad;
  const logoY      = height - logoMaxDim - logoPad - safeZone.bottom;

  // Text area left edge
  const textX = pad + (layout === 'story' ? 0 : 0);
  // Text area starts after safe zone
  const textAreaTop = safeZone.top + pad;

  // Headline — limit chars/line based on available width
  const textAreaW    = width - pad * 2;
  const avgCharW     = hSize * 0.54;
  const charsPerLine = Math.max(10, Math.floor(textAreaW / avgCharW));
  const hLines       = wrapText(headline, charsPerLine);
  const { tspans: hTspans, totalHeight: hTotalH } = buildTspans(
    hLines, textX, textAreaTop + hSize, lineH, 2
  );

  // Subhead
  const shCharsPerLine = Math.max(12, Math.floor(textAreaW / (shSize * 0.55)));
  const shLines        = wrapText(subhead, shCharsPerLine);
  const shY            = textAreaTop + hSize + hTotalH + Math.round(hSize * 0.55);
  const { tspans: shTspans, totalHeight: shTotalH } = buildTspans(
    shLines, textX, shY, shLineH, 3
  );

  // CTA
  const ctaY = shY + shTotalH + Math.round(shSize * 0.8);

  // Accent bottom strip
  const stripH = Math.max(6, Math.round(height * 0.007));

  // Font stack that works across Linux / macOS / Windows
  const fontStack = '"Liberation Sans","DejaVu Sans","Noto Sans",Arial,sans-serif';

  const logoEl = logoBase64
    ? `<image href="data:image/png;base64,${logoBase64}" ` +
      `x="${logoX}" y="${logoY}" ` +
      `width="${logoMaxDim}" height="${logoMaxDim}" ` +
      `preserveAspectRatio="xMidYMid meet" opacity="0.92"/>`
    : '';

  const subheadEl = subhead && shLines.length
    ? `<text font-family=${fontStack} font-size="${shSize}" fill="${textColor}" opacity="0.80">${shTspans}</text>`
    : '';

  const ctaEl = cta
    ? `<text x="${textX}" y="${ctaY}" ` +
      `font-family=${fontStack} font-size="${ctaSize}" ` +
      `fill="${textColor}" opacity="0.65" font-weight="500">${escapeXml(cta)}</text>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
     xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     shape-rendering="geometricPrecision" text-rendering="optimizeLegibility">
  <rect width="${width}" height="${height}" fill="${bgColor}"/>
  <rect x="0" y="${height - stripH}" width="${width}" height="${stripH}" fill="${textColor}" opacity="0.15"/>
  <text font-family=${fontStack} font-size="${hSize}" font-weight="700"
        fill="${textColor}" letter-spacing="-0.5">${hTspans}</text>
  ${subheadEl}
  ${ctaEl}
  ${logoEl}
</svg>`;
}

module.exports = { buildImageSvg, contrastColor, wrapText };
