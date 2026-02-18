import fs from "fs";
import path from "path";

function getUploadDir(): string {
  const dir = process.env.UPLOAD_DIR || "./uploads";
  return path.resolve(dir);
}

export function buildStoragePath(projectSlug: string, runId: string, filename: string): string {
  return path.join(projectSlug, runId, filename);
}

export async function saveFile(
  buffer: Buffer,
  projectSlug: string,
  runId: string,
  filename: string
): Promise<{ storagePath: string; fullPath: string }> {
  const uploadDir = getUploadDir();
  const dir = path.join(uploadDir, projectSlug, runId);
  fs.mkdirSync(dir, { recursive: true });

  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, buffer);

  const storagePath = buildStoragePath(projectSlug, runId, filename);
  return { storagePath, fullPath };
}

/** Save a project-level file (no run subfolder). */
export async function saveProjectFile(
  buffer: Buffer,
  projectSlug: string,
  filename: string
): Promise<{ storagePath: string; fullPath: string }> {
  const uploadDir = getUploadDir();
  const dir = path.join(uploadDir, projectSlug, "_project_docs");
  fs.mkdirSync(dir, { recursive: true });

  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, buffer);

  const storagePath = path.join(projectSlug, "_project_docs", filename);
  return { storagePath, fullPath };
}

export function getFilePath(storagePath: string): string {
  return path.join(getUploadDir(), storagePath);
}

export function deleteFile(storagePath: string): void {
  const fullPath = getFilePath(storagePath);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
}
