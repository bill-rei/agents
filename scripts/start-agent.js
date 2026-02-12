#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

function usage() {
  console.log("Usage:");
  console.log("  node scripts/start-agent.js <agentKey> [-- ...args]");
  console.log("Example:");
  console.log("  node scripts/start-agent.js marketing-compiler");
  console.log("  node scripts/start-agent.js marketing-staging-sync -- about about.json");
}

function main() {
  const agentKey = process.argv[2];
  if (!agentKey) {
    usage();
    process.exit(1);
  }

  const registryPath = path.join(process.cwd(), "agents.registry.json");
  if (!fs.existsSync(registryPath)) {
    console.error("Missing agents.registry.json at repo root.");
    process.exit(1);
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const raw = registry[agentKey];

  if (!raw) {
    console.error(`Unknown agent: "${agentKey}"`);
    console.error("Available agents:", Object.keys(registry).join(", "));
    process.exit(1);
  }

  // Support both string entries and object entries { entry, type }
  const entry = typeof raw === "string" ? raw : raw.entry;
  const type = typeof raw === "string" ? "server" : (raw.type || "server");

  const resolved = path.resolve(process.cwd(), entry);
  if (!fs.existsSync(resolved)) {
    console.error(`Entry not found for agent "${agentKey}": ${resolved}`);
    process.exit(1);
  }

  // Pass-through args after "--"
  const dashIdx = process.argv.indexOf("--");
  const extraArgs = dashIdx > -1 ? process.argv.slice(dashIdx + 1) : [];

  if (type === "cli" || entry.endsWith(".mjs")) {
    // CLI / ESM agents: spawn as a child process
    console.log(`[start-agent] Running CLI agent: ${agentKey} -> ${entry}`);
    const child = spawn(process.execPath, [resolved, ...extraArgs], {
      stdio: "inherit",
      cwd: path.dirname(resolved),
      env: process.env,
    });
    child.on("exit", (code) => process.exit(code ?? 1));
  } else {
    // Server agents: require directly
    console.log(`[start-agent] Starting: ${agentKey} -> ${entry}`);
    require(resolved);
  }
}

main();
