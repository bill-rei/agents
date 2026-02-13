#!/usr/bin/env node
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs");
const path = require("path");
const { validateArtifact } = require("../marketing-artifacts");
const wpAdapter = require("../publishers/web/wpElementorStaging");
const zohoAdapter = require("../publishers/social/zohoSocial");
const xDirectAdapter = require("../publishers/social/xDirect");
const linkedinDirectAdapter = require("../publishers/social/linkedinDirect");
const redditGuard = require("../publishers/social/redditGuard");
const { loadRegistry, resolvePageSlug, normalizePageKey, listSiteKeys, listPageKeys } = require("../lib/targetRegistry");

// ── Arg parsing ──

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { file: null, dryRun: false, apply: false, forceLive: false, updateTitle: false, only: null, site: null, page: null };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--file":
        opts.file = args[++i];
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--apply":
        opts.apply = true;
        break;
      case "--force-live":
        opts.forceLive = true;
        break;
      case "--update-title":
        opts.updateTitle = true;
        break;
      case "--only":
        opts.only = parseFilter(args[++i]);
        break;
      case "--site":
        opts.site = args[++i];
        break;
      case "--page":
        opts.page = args[++i];
        break;
      default:
        console.error(`Unknown flag: ${args[i]}`);
        process.exit(1);
    }
  }

  return opts;
}

function parseFilter(expr) {
  if (!expr || !expr.includes("=")) {
    console.error('--only expects key=value (e.g. --only site_key=llif-staging)');
    process.exit(1);
  }
  const [key, ...rest] = expr.split("=");
  return { key, value: rest.join("=") };
}

function usage() {
  console.log("Usage:");
  console.log("  node scripts/publish.js --file <artifacts.json> --dry-run");
  console.log("  node scripts/publish.js --file <artifacts.json> --apply");
  console.log("  node scripts/publish.js --site <site_key> --page <page_key> --file <artifact.json> --dry-run");
  console.log("");
  console.log("Options:");
  console.log("  --file <path>              JSON file with one artifact or an array");
  console.log("  --dry-run                  Print what would happen without publishing");
  console.log("  --apply                    Actually publish to staging");
  console.log("  --only key=value           Filter artifacts (e.g. --only site_key=llif-staging)");
  console.log("  --force-live               Allow live posting for status=published artifacts");
  console.log("  --update-title             Allow overwriting the WP page title");
  console.log("  --site <site_key>          Target site from registry (e.g. llif-staging)");
  console.log("  --page <page_key>          Page key or alias from registry (e.g. homepage, home)");
  console.log("");
  console.log("Available sites:");
  try {
    for (const key of listSiteKeys()) {
      const reg = loadRegistry(key);
      const pages = listPageKeys(key).join(", ");
      console.log(`  ${key} (${reg.label}): ${pages}`);
    }
  } catch (_) {
    console.log("  (could not read targets/)");
  }
}

// ── Filter ──

function matchesFilter(artifact, filter) {
  if (!filter) return true;
  const { key, value } = filter;

  // Check top-level fields first, then target
  if (artifact[key] === value) return true;
  if (artifact.target && artifact.target[key] === value) return true;
  return false;
}

// ── Routing ──

async function publishOne(artifact, opts) {
  switch (artifact.artifact_type) {
    case "web_page":
      return await wpAdapter.publish(artifact, { dryRun: opts.dryRun, updateTitle: opts.updateTitle });
    case "social_post": {
      const platform = artifact.target?.platform;
      if (platform === "reddit") {
        return await redditGuard.publish(artifact, { dryRun: opts.dryRun });
      }
      // Live posts (status=published) go through direct adapters
      if (artifact.status === "published") {
        if (platform === "x") {
          return await xDirectAdapter.publish(artifact, { dryRun: opts.dryRun, forceLive: opts.forceLive });
        }
        if (platform === "linkedin") {
          return await linkedinDirectAdapter.publish(artifact, { dryRun: opts.dryRun, forceLive: opts.forceLive });
        }
      }
      // Drafts, scheduled, and other statuses go through Zoho
      if (zohoAdapter.SUPPORTED_PLATFORMS.includes(platform)) {
        return await zohoAdapter.publish(artifact, { dryRun: opts.dryRun });
      }
      throw new Error(`Unsupported social platform: "${platform}"`);
    }
    case "blog_post":
      console.log(`  [stub] blog_post publishing not implemented`);
      return { status: "not-implemented" };
    default:
      throw new Error(`Unknown artifact_type: "${artifact.artifact_type}"`);
  }
}

// ── Summary table ──

function printSummary(results) {
  console.log("");
  console.log("─".repeat(72));
  console.log("  Summary");
  console.log("─".repeat(72));

  const idWidth = Math.max(12, ...results.map((r) => r.id.length));
  const header = `  ${"artifact_id".padEnd(idWidth)}  ${"type".padEnd(13)}  ${"result".padEnd(10)}  detail`;
  console.log(header);
  console.log("  " + "─".repeat(idWidth + 38));

  for (const r of results) {
    const icon = r.ok ? "ok" : "FAIL";
    const detail = r.detail || "";
    console.log(`  ${r.id.padEnd(idWidth)}  ${r.type.padEnd(13)}  ${icon.padEnd(10)}  ${detail}`);
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log("");
  console.log(`  ${passed} succeeded, ${failed} failed, ${results.length} total`);
  console.log("");
}

// ── Main ──

async function main() {
  const opts = parseArgs(process.argv);

  if (!opts.file) {
    usage();
    process.exit(1);
  }

  if (!opts.dryRun && !opts.apply) {
    console.error("Error: must specify either --dry-run or --apply");
    process.exit(1);
  }

  if (opts.dryRun && opts.apply) {
    console.error("Error: --dry-run and --apply are mutually exclusive");
    process.exit(1);
  }

  if (opts.page && !opts.site) {
    console.error("Error: --page requires --site");
    process.exit(1);
  }

  // Validate --site against registry (staging-only guard)
  if (opts.site) {
    const reg = loadRegistry(opts.site);
    if (reg.environment !== "staging") {
      console.error(
        `Error: site "${opts.site}" has environment="${reg.environment}". ` +
        "Only staging sites are supported."
      );
      process.exit(1);
    }
    console.log(`Registry: ${reg.label} (${opts.site})`);
    if (opts.page) {
      // Normalize alias before resolving
      const canonical = normalizePageKey(opts.site, opts.page);
      if (canonical !== opts.page) {
        console.log(`Page alias: "${opts.page}" → "${canonical}"`);
      }
      opts.page = canonical;
      const pageInfo = resolvePageSlug(opts.site, opts.page);
      console.log(`Page: ${opts.page} → slug "${pageInfo.slug}"${pageInfo.page_id ? ` (id: ${pageInfo.page_id})` : ""}`);
    }
    console.log("");
  }

  // Load artifacts
  const filePath = path.resolve(opts.file);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`Failed to read ${filePath}: ${err.message}`);
    process.exit(1);
  }

  const artifacts = Array.isArray(raw) ? raw : [raw];
  console.log(`Loaded ${artifacts.length} artifact(s) from ${opts.file}`);

  // Apply --site / --page overrides from registry
  if (opts.site || opts.page) {
    for (const artifact of artifacts) {
      if (!artifact.target) artifact.target = {};
      if (opts.site) {
        artifact.target.site_key = opts.site;
      }
      if (opts.page) {
        const pageInfo = resolvePageSlug(opts.site, opts.page);
        artifact.target.slug = pageInfo.slug;
        if (pageInfo.page_id) artifact.target.page_id = pageInfo.page_id;
      }
    }
  }

  if (opts.dryRun) console.log("[dry-run mode]");
  if (opts.forceLive) console.log("[--force-live enabled — live posting permitted]");
  console.log("");

  // Filter
  const filtered = artifacts.filter((a) => matchesFilter(a, opts.only));
  if (opts.only) {
    console.log(`Filter --only ${opts.only.key}=${opts.only.value}: ${filtered.length} of ${artifacts.length} matched`);
    console.log("");
  }

  // Process
  const results = [];

  for (const artifact of filtered) {
    const id = artifact.artifact_id || "(no id)";
    const type = artifact.artifact_type || "(no type)";
    console.log(`>> ${id} (${type})`);

    // Validate
    const validation = validateArtifact(artifact);
    if (!validation.valid) {
      console.log(`   Validation failed:`);
      for (const e of validation.errors) console.log(`     - ${e}`);
      results.push({ id, type, ok: false, detail: validation.errors[0] });
      continue;
    }

    // Publish
    try {
      const res = await publishOne(artifact, opts);
      if (res.status === "BLOCKED") {
        results.push({ id, type, ok: false, detail: `BLOCKED: ${res.reasons[0]}` });
      } else {
        const detail =
          res.status === "not-implemented"
            ? "stub — not implemented"
            : res.status === "dry-run"
              ? `dry-run ok`
              : res.url || res.link || res.status;
        results.push({ id, type, ok: true, detail });
      }
    } catch (err) {
      console.log(`   Error: ${err.message}`);
      results.push({ id, type, ok: false, detail: err.message });
    }
  }

  printSummary(results);

  const anyFailed = results.some((r) => !r.ok);
  process.exit(anyFailed ? 1 : 0);
}

main();
