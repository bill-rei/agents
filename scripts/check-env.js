#!/usr/bin/env node
/* eslint-disable no-console */
require("dotenv").config();

const required = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"];
const missing = required.filter((k) => !process.env[k] || String(process.env[k]).trim() === "");

if (missing.length) {
  console.error("Missing required environment variables:");
  for (const k of missing) console.error(`- ${k}`);
  process.exit(1);
}

console.log("Env OK:", required.join(", "));
