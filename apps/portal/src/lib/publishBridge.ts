import { execFile } from "child_process";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import path from "path";
import os from "os";

const REPO_ROOT = process.env.AGENTS_REPO_ROOT || path.resolve(process.cwd(), "../..");

export interface PublishResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function publishViaCli(
  artifact: Record<string, unknown>,
  opts: { dryRun: boolean; siteKey?: string; pageKey?: string }
): Promise<PublishResult> {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "portal-publish-"));
  const tmpFile = path.join(tmpDir, "artifact.json");
  writeFileSync(tmpFile, JSON.stringify(artifact, null, 2));

  const args = [
    path.join(REPO_ROOT, "scripts/publish.js"),
    "--file",
    tmpFile,
    opts.dryRun ? "--dry-run" : "--apply",
  ];

  if (opts.siteKey) {
    args.push("--site", opts.siteKey);
  }
  if (opts.pageKey) {
    args.push("--page", opts.pageKey);
  }

  return new Promise((resolve) => {
    execFile(
      "node",
      args,
      {
        cwd: REPO_ROOT,
        timeout: 30000,
        env: { ...process.env },
      },
      (error, stdout, stderr) => {
        try {
          unlinkSync(tmpFile);
        } catch {
          // ignore
        }

        resolve({
          ok: error === null,
          stdout: stdout || "",
          stderr: stderr || "",
          exitCode: error ? (error as NodeJS.ErrnoException & { code?: number }).code ?? 1 : 0,
        });
      }
    );
  });
}
