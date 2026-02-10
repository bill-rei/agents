#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const fs = require("fs");

function usage() {
  console.log("Usage:");
  console.log("  node scripts/start-agent.js <agentKey>");
  console.log("Example:");
  console.log("  node scripts/start-agent.js marketing-compiler");
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
  const entry = registry[agentKey];

  if (!entry) {
    console.error(`Unknown agent: "${agentKey}"`);
    console.error("Available agents:", Object.keys(registry).join(", "));
    process.exit(1);
  }

  const resolved = path.resolve(process.cwd(), entry);
  if (!fs.existsSync(resolved)) {
    console.error(`Entry not found for agent "${agentKey}": ${resolved}`);
    process.exit(1);
  }

  console.log(`[start-agent] Starting: ${agentKey} -> ${entry}`);
  require(resolved);
}

main();
