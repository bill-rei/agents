'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const archiver = require('archiver');
const { Resvg } = require('@resvg/resvg-js');
const sharp = require('sharp');
const { FAVICON_SIZES, SOCIAL_SIZES, CANVA_LOGO_SIZES } = require('./sizes');

// ── Path helpers ──────────────────────────────────────────────────────────────

function getSharedContentPath() {
  return (
    process.env.SHARED_CONTENT_PATH ||
    path.resolve(__dirname, '../../marketing-ops-shared-content')
  );
}

function getBrandDir(brandKey) {
  return path.join(getSharedContentPath(), 'brand', brandKey);
}

function getSourceSvgPath(brandKey) {
  return path.join(getBrandDir(brandKey), 'source', 'logo-master.svg');
}

// ── Brand manifest ────────────────────────────────────────────────────────────

function loadBrandManifest(brandKey) {
  const defaults = {
    name: brandKey,
    shortName: brandKey,
    tagline: '',
    backgroundColor: '#ffffff',
    themeColor: '#000000',
  };
  const manifestPath = path.join(getSharedContentPath(), 'brand', 'brand-manifest.json');
  if (!fs.existsSync(manifestPath)) return defaults;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return { ...defaults, ...(manifest.brands?.[brandKey] ?? {}) };
  } catch {
    return defaults;
  }
}

// ── SVG validation ────────────────────────────────────────────────────────────

function validateSvg(svgContent) {
  const warnings = [];
  if (!svgContent.includes('viewBox') && !svgContent.includes('viewbox')) {
    warnings.push('SVG is missing a viewBox attribute — output dimensions may be incorrect');
  }
  if (/href=['"]https?:\/\//i.test(svgContent)) {
    warnings.push('SVG contains external references — they may not render correctly offline');
  }
  const wMatch = svgContent.match(/\bwidth="(\d+(?:\.\d+)?)"/);
  const hMatch = svgContent.match(/\bheight="(\d+(?:\.\d+)?)"/);
  if (wMatch && hMatch) {
    const w = parseFloat(wMatch[1]);
    const h = parseFloat(hMatch[1]);
    if (w < 16 || h < 16) {
      warnings.push(`SVG artboard is very small (${w}x${h}px) — consider adding a viewBox`);
    }
  }
  return warnings;
}

// ── Image rendering ───────────────────────────────────────────────────────────

/**
 * Render an SVG string to a high-res PNG buffer via resvg.
 */
async function renderSvg(svgContent, renderWidth = 2048) {
  const resvg = new Resvg(svgContent, {
    fitTo: { mode: 'width', value: renderWidth },
    background: 'transparent',
  });
  return Buffer.from(resvg.render().asPng());
}

/**
 * Generate a PNG with the logo centred on a transparent canvas
 * at exact pixel dimensions.
 */
async function generateTransparentPng(svgContent, width, height) {
  const renderSize = Math.max(width, height) * 2;
  const highRes = await renderSvg(svgContent, renderSize);

  const resized = await sharp(highRes)
    .resize(width, height, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const meta = await sharp(resized).metadata();
  const actualW = meta.width || width;
  const actualH = meta.height || height;
  const padLeft   = Math.floor((width  - actualW) / 2);
  const padTop    = Math.floor((height - actualH) / 2);
  const padRight  = width  - actualW - padLeft;
  const padBottom = height - actualH - padTop;

  return sharp(resized)
    .extend({ top: padTop, bottom: padBottom, left: padLeft, right: padRight,
              background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

/**
 * Generate a PNG with the logo centred on a solid-colour canvas
 * (used for social images, OG, and opaque favicons).
 */
async function generateCompositePng(svgContent, width, height, bgColor = '#ffffff', safePadding = 80) {
  const safeW = Math.max(1, width  - safePadding * 2);
  const safeH = Math.max(1, height - safePadding * 2);
  const renderSize = Math.max(safeW, safeH) * 2;

  const highRes = await renderSvg(svgContent, renderSize);

  const logoBuffer = await sharp(highRes)
    .resize(safeW, safeH, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const logoMeta = await sharp(logoBuffer).metadata();
  const logoW = logoMeta.width || safeW;
  const logoH = logoMeta.height || safeH;
  const left = Math.round((width  - logoW) / 2);
  const top  = Math.round((height - logoH) / 2);

  const bg = hexToRgb(bgColor);
  return sharp({
    create: { width, height, channels: 4,
              background: { r: bg.r, g: bg.g, b: bg.b, alpha: 255 } },
  })
    .composite([{ input: logoBuffer, top, left }])
    .png()
    .toBuffer();
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

async function verifyDimensions(buf, w, h) {
  const meta = await sharp(buf).metadata();
  if (meta.width !== w || meta.height !== h) {
    throw new Error(
      `Dimension mismatch: expected ${w}x${h}, got ${meta.width}x${meta.height}`
    );
  }
}

function sha256Short(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

// ── Canva ZIP builder ─────────────────────────────────────────────────────────

function createCanvaZip(canvaDir, zipPath, manifest) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    for (const folder of ['logos', 'favicon', 'social']) {
      const fp = path.join(canvaDir, folder);
      if (fs.existsSync(fp)) archive.directory(fp, folder);
    }
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    archive.finalize();
  });
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Compile all brand assets for the given brandKey.
 *
 * @param {{ brandKey: string, force?: boolean }} opts
 * @returns {Promise<{ ok: boolean, brandKey: string, generated: string[], skipped: string[], warnings: string[] }>}
 */
async function compileBrandAssets({ brandKey, force = false }) {
  const generated = [];
  const skipped   = [];
  const warnings  = [];
  const filesMeta = [];

  // ── Validate source SVG ──────────────────────────────────────────────────
  const svgPath = getSourceSvgPath(brandKey);
  if (!fs.existsSync(svgPath)) {
    throw new Error(`Master SVG not found at expected path: ${svgPath}`);
  }
  const svgContent = fs.readFileSync(svgPath, 'utf8');
  warnings.push(...validateSvg(svgContent));

  // ── Brand config ─────────────────────────────────────────────────────────
  const brand   = loadBrandManifest(brandKey);
  const bgColor = brand.backgroundColor || '#ffffff';

  // ── Directory setup ──────────────────────────────────────────────────────
  const brandDir       = getBrandDir(brandKey);
  const faviconDir     = path.join(brandDir, 'favicon');
  const socialDir      = path.join(brandDir, 'social');
  const nextjsDir      = path.join(brandDir, 'nextjs');
  const nextjsIconsDir = path.join(nextjsDir, 'icons');
  const canvaDir       = path.join(brandDir, 'canva-bundle');
  const canvaLogosDir  = path.join(canvaDir, 'logos');
  const canvaFavDir    = path.join(canvaDir, 'favicon');
  const canvaSocialDir = path.join(canvaDir, 'social');

  for (const dir of [faviconDir, socialDir, nextjsDir, nextjsIconsDir,
                     canvaDir, canvaLogosDir, canvaFavDir, canvaSocialDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const shared = getSharedContentPath();
  const rel = (p) => path.relative(shared, p);

  function shouldWrite(outPath) {
    if (fs.existsSync(outPath) && !force) {
      skipped.push(rel(outPath));
      return false;
    }
    return true;
  }

  function record(outPath, w, h, category, buf) {
    generated.push(rel(outPath));
    if (buf) filesMeta.push({ path: rel(outPath), width: w, height: h, category, checksum: sha256Short(buf) });
  }

  // ── favicon.svg ──────────────────────────────────────────────────────────
  const favSvgPath = path.join(faviconDir, 'favicon.svg');
  if (shouldWrite(favSvgPath)) {
    fs.writeFileSync(favSvgPath, svgContent);
    record(favSvgPath, null, null, 'favicon', null);
  }

  // ── Favicon PNGs ─────────────────────────────────────────────────────────
  for (const sz of FAVICON_SIZES) {
    const outPath = path.join(faviconDir, sz.name);
    if (!shouldWrite(outPath)) continue;

    const buf = sz.transparent === false
      ? await generateCompositePng(svgContent, sz.width, sz.height, '#ffffff', 20)
      : await generateTransparentPng(svgContent, sz.width, sz.height);

    await verifyDimensions(buf, sz.width, sz.height);
    fs.writeFileSync(outPath, buf);
    record(outPath, sz.width, sz.height, 'favicon', buf);

    // Mirror to nextjs/icons/
    const niPath = path.join(nextjsIconsDir, sz.name);
    if (!fs.existsSync(niPath) || force) {
      fs.writeFileSync(niPath, buf);
      generated.push(rel(niPath));
    }

    // Mirror to canva-bundle/favicon/
    const cfPath = path.join(canvaFavDir, sz.name);
    if (!fs.existsSync(cfPath) || force) fs.writeFileSync(cfPath, buf);
  }

  // Mirror favicon.svg into canva-bundle/favicon/
  const cfSvgPath = path.join(canvaFavDir, 'favicon.svg');
  if (!fs.existsSync(cfSvgPath) || force) fs.writeFileSync(cfSvgPath, svgContent);

  // ── Social PNGs ──────────────────────────────────────────────────────────
  for (const sz of SOCIAL_SIZES) {
    const outPath = path.join(socialDir, sz.name);
    if (!shouldWrite(outPath)) continue;

    const padding = sz.isOG ? 80 : Math.min(Math.round(sz.height * 0.1), 80);
    const buf = await generateCompositePng(svgContent, sz.width, sz.height, bgColor, padding);

    await verifyDimensions(buf, sz.width, sz.height);
    fs.writeFileSync(outPath, buf);
    record(outPath, sz.width, sz.height, 'social', buf);

    // Mirror to canva-bundle/social/
    const csPath = path.join(canvaSocialDir, sz.name);
    if (!fs.existsSync(csPath) || force) fs.writeFileSync(csPath, buf);
  }

  // ── Canva logo PNGs ──────────────────────────────────────────────────────
  for (const sz of CANVA_LOGO_SIZES) {
    const outPath = path.join(canvaLogosDir, sz.name);
    if (!shouldWrite(outPath)) continue;

    const buf = await generateTransparentPng(svgContent, sz.width, sz.height);
    await verifyDimensions(buf, sz.width, sz.height);
    fs.writeFileSync(outPath, buf);
    record(outPath, sz.width, sz.height, 'canva', buf);
  }

  // Master SVG in canva logos folder
  const clSvgPath = path.join(canvaLogosDir, 'logo-master.svg');
  if (!fs.existsSync(clSvgPath) || force) {
    fs.writeFileSync(clSvgPath, svgContent);
    generated.push(rel(clSvgPath));
  }

  // ── manifest.webmanifest ─────────────────────────────────────────────────
  const webManifestPath = path.join(faviconDir, 'manifest.webmanifest');
  if (!fs.existsSync(webManifestPath) || force) {
    const webManifest = {
      name: brand.name,
      short_name: brand.shortName,
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
      theme_color: brand.themeColor || '#000000',
      background_color: bgColor,
      display: 'standalone',
      start_url: '/',
    };
    fs.writeFileSync(webManifestPath, JSON.stringify(webManifest, null, 2));
    generated.push(rel(webManifestPath));
  }

  // ── Next.js metadata snippet ─────────────────────────────────────────────
  const snippetPath = path.join(nextjsDir, 'metadata-snippet.md');
  if (!fs.existsSync(snippetPath) || force) {
    fs.writeFileSync(snippetPath, buildMetadataSnippet(brand));
    generated.push(rel(snippetPath));
  }

  // ── Canva bundle manifest.json ───────────────────────────────────────────
  const canvaManifest = {
    brand: brandKey,
    generatedAt: new Date().toISOString(),
    files: [
      ...CANVA_LOGO_SIZES.map((s) => ({
        file: `logos/${s.name}`, width: s.width, height: s.height, intendedUse: 'logo',
      })),
      { file: 'logos/logo-master.svg', intendedUse: 'logo-vector' },
      ...FAVICON_SIZES.map((s) => ({
        file: `favicon/${s.name}`, width: s.width, height: s.height, intendedUse: 'favicon',
      })),
      { file: 'favicon/favicon.svg', intendedUse: 'favicon-vector' },
      ...SOCIAL_SIZES.map((s) => ({
        file: `social/${s.name}`, width: s.width, height: s.height, intendedUse: 'social',
      })),
    ],
  };
  const canvaManifestPath = path.join(canvaDir, 'manifest.json');
  fs.writeFileSync(canvaManifestPath, JSON.stringify(canvaManifest, null, 2));

  // ── Canva bundle ZIP ─────────────────────────────────────────────────────
  const zipPath = path.join(canvaDir, 'bundle.zip');
  if (!fs.existsSync(zipPath) || force) {
    await createCanvaZip(canvaDir, zipPath, canvaManifest);
    generated.push(rel(zipPath));
  }

  // ── Build report ─────────────────────────────────────────────────────────
  const report = {
    brandKey,
    generatedAt: new Date().toISOString(),
    sourceFile: rel(svgPath),
    generated,
    skipped,
    warnings,
    files: filesMeta,
  };
  fs.writeFileSync(path.join(brandDir, 'build-report.json'), JSON.stringify(report, null, 2));

  return { ok: true, brandKey, generated, skipped, warnings };
}

function buildMetadataSnippet(brand) {
  return `# Next.js Metadata — ${brand.name}

Copy these declarations into your root \`layout.tsx\`.

\`\`\`typescript
import type { Metadata } from 'next'

export const metadata: Metadata = {
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon-32x32.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    images: [{ url: '/og-default-1200x630.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og-default-1200x630.png'],
  },
}
\`\`\`

## File placement

Place these files in your Next.js \`public/\` directory:

\`\`\`
public/
  favicon.svg
  favicon-32x32.png
  apple-touch-icon.png
  icon-192.png
  icon-512.png
  manifest.webmanifest
  og-default-1200x630.png
\`\`\`

## Next.js App Router (v13+) auto-discovery

Rename and place in \`app/\` for automatic icon handling:

\`\`\`
app/
  icon.png          ← icon-512.png
  apple-icon.png    ← apple-touch-icon.png
\`\`\`
`;
}

module.exports = { compileBrandAssets };
