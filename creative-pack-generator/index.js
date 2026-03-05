'use strict';

const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const archiver = require('archiver');
const { Resvg }  = require('@resvg/resvg-js');
const sharp      = require('sharp');

const { IMAGE_SIZES, COPY_SPECS } = require('./sizes');
const { buildImageSvg }           = require('./templates');
const { generateCopyVariants }    = require('./copy-generator');

// ── Path utilities ────────────────────────────────────────────────────────────

function getSharedContentPath() {
  return (
    process.env.SHARED_CONTENT_PATH ||
    path.resolve(__dirname, '../../marketing-ops-shared-content')
  );
}

function getBrandDir(brandKey) {
  return path.join(getSharedContentPath(), 'brand', brandKey);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

function getCreativePackDir(brandKey, campaignSlug, month) {
  return path.join(
    getSharedContentPath(),
    'campaigns', month, brandKey, campaignSlug, 'creative-pack'
  );
}

// ── Brand manifest (re-implements from brand-asset-compiler to avoid coupling) ─

function loadBrandManifest(brandKey) {
  const defaults = {
    name: brandKey,
    shortName: brandKey,
    tagline: '',
    backgroundColor: '#1a1a2e',
    themeColor: '#0f3460',
  };
  const manifestPath = path.join(getSharedContentPath(), 'brand', 'brand-manifest.json');
  if (!fs.existsSync(manifestPath)) return defaults;
  try {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return { ...defaults, ...(m.brands?.[brandKey] ?? {}) };
  } catch {
    return defaults;
  }
}

// ── Brand asset loader ────────────────────────────────────────────────────────

/**
 * Load the brand logo as a base64 string for SVG embedding.
 * Falls back to auto-running Brand Asset Compiler if logo is missing.
 */
async function loadLogoBase64(brandKey, warnings) {
  const logoPath = path.join(getBrandDir(brandKey), 'favicon', 'icon-512.png');

  if (!fs.existsSync(logoPath)) {
    warnings.push(`Brand logo not found at ${logoPath} — attempting to run Brand Asset Compiler…`);
    try {
      const { compileBrandAssets } = require('../brand-asset-compiler/index');
      await compileBrandAssets({ brandKey, force: false });
    } catch (err) {
      warnings.push(`Auto-compilation failed: ${err.message}. Run Brand Asset Compiler first.`);
      return null;
    }
  }

  if (!fs.existsSync(logoPath)) return null;
  return fs.readFileSync(logoPath).toString('base64');
}

// ── Campaign data resolver ────────────────────────────────────────────────────

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Resolve campaign data from request fields or from campaign.json on disk.
 */
function resolveCampaign(opts) {
  const {
    brandKey, campaignSlug, campaignTitle, keyMessage, cta,
    campaignMonth, sourceMarkdownPath,
  } = opts;

  const month = campaignMonth || currentMonth();
  const slug  = campaignSlug || slugify(campaignTitle || 'campaign');

  // Full mode: all fields provided directly
  if (campaignTitle && (keyMessage || cta)) {
    return { slug, title: campaignTitle, keyMessage: keyMessage || '', cta: cta || '', month, brandKey };
  }

  // Minimal mode: try campaign.json on disk
  const campaignDir  = path.join(getSharedContentPath(), 'campaigns', month, brandKey, slug);
  const campaignJson = path.join(campaignDir, 'campaign.json');

  if (fs.existsSync(campaignJson)) {
    const data = JSON.parse(fs.readFileSync(campaignJson, 'utf8'));
    return {
      slug,
      title:      data.title      || campaignTitle || slug,
      keyMessage: data.keyMessage || keyMessage    || '',
      cta:        data.cta        || cta           || '',
      month,
      brandKey,
    };
  }

  // Scan other months if current month not found
  const campaignsRoot = path.join(getSharedContentPath(), 'campaigns');
  if (fs.existsSync(campaignsRoot)) {
    for (const monthDir of fs.readdirSync(campaignsRoot).sort().reverse()) {
      const alt = path.join(campaignsRoot, monthDir, brandKey, slug, 'campaign.json');
      if (fs.existsSync(alt)) {
        const data = JSON.parse(fs.readFileSync(alt, 'utf8'));
        return {
          slug,
          title:      data.title      || campaignTitle || slug,
          keyMessage: data.keyMessage || keyMessage    || '',
          cta:        data.cta        || cta           || '',
          month:      monthDir,
          brandKey,
        };
      }
    }
  }

  // Bare minimum — use whatever was passed
  return {
    slug,
    title:      campaignTitle || slug,
    keyMessage: keyMessage    || '',
    cta:        cta           || '',
    month,
    brandKey,
  };
}

// ── Image generation ──────────────────────────────────────────────────────────

async function renderSvgToPng(svgContent, width, height) {
  const resvg = new Resvg(svgContent, {
    fitTo: { mode: 'original' },
    font:  { loadSystemFonts: true },
  });
  const pngBuffer = Buffer.from(resvg.render().asPng());

  // Verify dimensions — resvg should honour the SVG width/height attributes
  const meta = await sharp(pngBuffer).metadata();
  if (meta.width !== width || meta.height !== height) {
    // Force correct size if resvg deviated
    return sharp(pngBuffer)
      .resize(width, height, { fit: 'fill' })
      .png()
      .toBuffer();
  }
  return pngBuffer;
}

async function generateImages({ campaign, brand, logoBase64, packDir, force, generated, skipped, warnings }) {
  const imagesDir = path.join(packDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  const shared = getSharedContentPath();

  for (const sz of IMAGE_SIZES) {
    const outPath = path.join(imagesDir, sz.name);
    const rel     = path.relative(shared, outPath);

    if (fs.existsSync(outPath) && !force) {
      skipped.push(rel);
      continue;
    }

    try {
      const svgContent = buildImageSvg({
        width:       sz.width,
        height:      sz.height,
        layout:      sz.layout,
        safeZone:    sz.safeZone,
        bgColor:     brand.backgroundColor,
        headline:    campaign.title,
        subhead:     campaign.keyMessage,
        cta:         campaign.cta,
        logoBase64,
      });

      const buf = await renderSvgToPng(svgContent, sz.width, sz.height);

      // Final dimension check
      const meta = await sharp(buf).metadata();
      if (meta.width !== sz.width || meta.height !== sz.height) {
        warnings.push(`${sz.name}: dimension mismatch (${meta.width}x${meta.height} vs ${sz.width}x${sz.height})`);
      }

      fs.writeFileSync(outPath, buf);
      generated.push(rel);
    } catch (err) {
      warnings.push(`Failed to generate ${sz.name}: ${err.message}`);
    }
  }
}

// ── Copy generation ───────────────────────────────────────────────────────────

async function generateCopyFiles({ campaign, packDir, force, generated, skipped, provider }) {
  const copyDir = path.join(packDir, 'copy');
  fs.mkdirSync(copyDir, { recursive: true });

  const shared = getSharedContentPath();

  for (const spec of COPY_SPECS) {
    const outPath = path.join(copyDir, spec.filename);
    const rel     = path.relative(shared, outPath);

    if (fs.existsSync(outPath) && !force) {
      skipped.push(rel);
      continue;
    }

    const brandManifest = loadBrandManifest(spec.brandKey);
    const copy = await generateCopyVariants({
      platform:      spec.platform,
      brandKey:      spec.brandKey,
      brandName:     brandManifest.name,
      campaignTitle: campaign.title,
      keyMessage:    campaign.keyMessage,
      cta:           campaign.cta,
      variantCount:  spec.variants,
      provider,
    });

    fs.writeFileSync(outPath, copy, 'utf8');
    generated.push(rel);
  }
}

// ── Canva bundle ZIP ──────────────────────────────────────────────────────────

function createCanvaZip(packDir, brandKey, zipPath, manifest) {
  return new Promise((resolve, reject) => {
    const output  = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    // Images + copy folders
    const imagesDir = path.join(packDir, 'images');
    const copyDir   = path.join(packDir, 'copy');
    if (fs.existsSync(imagesDir)) archive.directory(imagesDir, 'images');
    if (fs.existsSync(copyDir))   archive.directory(copyDir,   'copy');

    // Brand assets (logo SVG + primary PNG)
    const brandDir  = getBrandDir(brandKey);
    const logoSvg   = path.join(brandDir, 'canva-bundle', 'logos', 'logo-master.svg');
    const logo512   = path.join(brandDir, 'favicon', 'icon-512.png');
    const logo1024  = path.join(brandDir, 'canva-bundle', 'logos', 'logo-1024.png');
    if (fs.existsSync(logoSvg))  archive.file(logoSvg,  { name: 'brand/logo-master.svg' });
    if (fs.existsSync(logo512))  archive.file(logo512,  { name: 'brand/icon-512.png' });
    if (fs.existsSync(logo1024)) archive.file(logo1024, { name: 'brand/logo-1024.png' });

    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    archive.finalize();
  });
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * @param {{
 *   brandKey: string,
 *   campaignSlug?: string,
 *   campaignTitle?: string,
 *   keyMessage?: string,
 *   cta?: string,
 *   sourceMarkdownPath?: string,
 *   campaignMonth?: string,
 *   force?: boolean,
 *   provider?: string,
 * }} opts
 */
async function generateCreativePack(opts) {
  const { brandKey, force = false, provider } = opts;
  const generated = [];
  const skipped   = [];
  const warnings  = [];

  // ── Resolve campaign ────────────────────────────────────────────────────
  const campaign = resolveCampaign(opts);
  const shared   = getSharedContentPath();

  // ── Load brand config ───────────────────────────────────────────────────
  const brand     = loadBrandManifest(brandKey);
  const logoBase64 = await loadLogoBase64(brandKey, warnings);

  // ── Set up output directories ───────────────────────────────────────────
  const packDir    = getCreativePackDir(brandKey, campaign.slug, campaign.month);
  const canvaDir   = path.join(packDir, 'canva-bundle');
  fs.mkdirSync(path.join(packDir, 'images'), { recursive: true });
  fs.mkdirSync(path.join(packDir, 'copy'),   { recursive: true });
  fs.mkdirSync(canvaDir,                     { recursive: true });

  // ── Generate images ─────────────────────────────────────────────────────
  await generateImages({ campaign, brand, logoBase64, packDir, force, generated, skipped, warnings });

  // ── Generate copy ───────────────────────────────────────────────────────
  await generateCopyFiles({ campaign, packDir, force, generated, skipped, provider });

  // ── Write manifest.json ─────────────────────────────────────────────────
  const manifest = {
    brandKey,
    campaignSlug: campaign.slug,
    campaignTitle: campaign.title,
    generatedAt: new Date().toISOString(),
    images: IMAGE_SIZES.map((sz) => ({
      file:      `images/${sz.name}`,
      width:     sz.width,
      height:    sz.height,
      platform:  sz.platform,
    })),
    copy: COPY_SPECS.map((spec) => ({
      file:      `copy/${spec.filename}`,
      platform:  spec.platform,
      brandKey:  spec.brandKey,
      variants:  spec.variants,
    })),
  };
  const manifestPath = path.join(packDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  generated.push(path.relative(shared, manifestPath));

  // ── Canva bundle ZIP ────────────────────────────────────────────────────
  const zipPath = path.join(canvaDir, 'bundle.zip');
  if (!fs.existsSync(zipPath) || force) {
    await createCanvaZip(packDir, brandKey, zipPath, manifest);
    generated.push(path.relative(shared, zipPath));
  } else {
    skipped.push(path.relative(shared, zipPath));
  }

  // ── Build report ────────────────────────────────────────────────────────
  const report = {
    brandKey,
    campaignSlug: campaign.slug,
    campaignTitle: campaign.title,
    month: campaign.month,
    generatedAt: new Date().toISOString(),
    outputDir: path.relative(shared, packDir),
    generated,
    skipped,
    warnings,
  };
  fs.writeFileSync(path.join(packDir, 'build-report.json'), JSON.stringify(report, null, 2));

  return { ok: true, brandKey, campaignSlug: campaign.slug, generated, skipped, warnings };
}

module.exports = { generateCreativePack };
