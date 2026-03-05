import path from "path";
import fs from "fs/promises";

/**
 * MediaStore writes media files into a repo-backed folder.
 *
 * Resolution order for the base path:
 *   1. process.env.MEDIA_REPO_PATH
 *   2. <project-root>/../marketing-ops-shared-content/media
 *   3. <project-root>/data/media  (safe local fallback)
 */
function getMediaBase(): string {
  if (process.env.MEDIA_REPO_PATH) return process.env.MEDIA_REPO_PATH;
  // Try shared-content repo sibling
  const sibling = path.resolve(process.cwd(), "../marketing-ops-shared-content/media");
  return sibling;
}

function fallbackMediaBase(): string {
  return path.resolve(process.cwd(), "data/media");
}

async function resolveBase(): Promise<string> {
  const primary = getMediaBase();
  try {
    await fs.access(path.dirname(primary));
    await fs.mkdir(primary, { recursive: true });
    return primary;
  } catch {
    const fallback = fallbackMediaBase();
    await fs.mkdir(fallback, { recursive: true });
    return fallback;
  }
}

export interface SaveAssetOptions {
  brandMode: string;
  campaignId: string;
  filename: string;
  mime: string;
}

export interface AssetRef {
  ref: string;   // repo-relative path: brandMode/campaignId/filename
  path: string;  // absolute path on disk
}

export interface AssetEntry {
  ref: string;
  filename: string;
  size: number;
  mime?: string;
}

export async function saveAsset(
  fileBuffer: Buffer,
  opts: SaveAssetOptions
): Promise<AssetRef> {
  const base = await resolveBase();
  const safeName = opts.filename.replace(/[^a-z0-9._-]/gi, "_");
  const dir = path.join(base, opts.brandMode, opts.campaignId);
  await fs.mkdir(dir, { recursive: true });

  const fullPath = path.join(dir, safeName);
  await fs.writeFile(fullPath, fileBuffer);

  const ref = `${opts.brandMode}/${opts.campaignId}/${safeName}`;
  return { ref, path: fullPath };
}

export async function getAssetPath(ref: string): Promise<string> {
  const base = await resolveBase();
  return path.join(base, ref);
}

export async function listAssets(campaignId: string): Promise<AssetEntry[]> {
  const base = await resolveBase();
  const entries: AssetEntry[] = [];

  // Walk brandMode/campaignId dirs
  for (const brandDir of ["LLIF", "BestLife"]) {
    const dir = path.join(base, brandDir, campaignId);
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        const stat = await fs.stat(path.join(dir, file));
        if (stat.isFile()) {
          entries.push({ ref: `${brandDir}/${campaignId}/${file}`, filename: file, size: stat.size });
        }
      }
    } catch {
      // directory doesn't exist yet — skip
    }
  }

  return entries;
}
