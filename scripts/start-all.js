#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const registryPath = path.join(process.cwd(), "agents.registry.json");
if (!fs.existsSync(registryPath)) {
  console.error("Missing agents.registry.json at repo root.");
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));

for (const agentKey of Object.keys(registry)) {
  const raw = registry[agentKey];
  const type = typeof raw === "string" ? "server" : (raw.type || "server");

  if (type === "cli") {
    console.log(`[start-all] Skipping CLI agent: ${agentKey}`);
    continue;
  }

  console.log(`[start-all] Launching ${agentKey}`);

  // spawn a new Node process per agent so they don't share the same event loop
  const child = spawn(process.execPath, [path.join("scripts", "start-agent.js"), agentKey], {
    stdio: "inherit",
    env: process.env
  });

  child.on("exit", (code) => {
    console.log(`[start-all] ${agentKey} exited with code ${code}`);
  });
}
