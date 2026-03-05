#!/usr/bin/env node
'use strict';

/**
 * Brand Asset Compiler — CLI runner
 *
 * Usage:
 *   node scripts/brand-asset-compiler.js --brand LLIF
 *   node scripts/brand-asset-compiler.js --brand BestLife --force
 *   npm run brand-assets -- --brand LLIF --force
 */

require('dotenv').config();
const { compileBrandAssets } = require('../brand-asset-compiler/index');

const VALID_BRANDS = ['LLIF', 'BestLife'];

function parseArgs(argv) {
  const args = { brand: null, force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--brand' && argv[i + 1]) {
      args.brand = argv[++i];
    } else if (argv[i] === '--force') {
      args.force = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.brand) {
    console.error('Error: --brand is required (LLIF or BestLife)');
    console.error('Usage: node scripts/brand-asset-compiler.js --brand LLIF [--force]');
    process.exit(1);
  }

  if (!VALID_BRANDS.includes(args.brand)) {
    console.error(`Error: --brand must be one of: ${VALID_BRANDS.join(', ')}`);
    process.exit(1);
  }

  console.log(`\n[brand-asset-compiler] Starting — brand: ${args.brand}, force: ${args.force}`);
  console.log(`[brand-asset-compiler] Shared content path: ${process.env.SHARED_CONTENT_PATH || '../../marketing-ops-shared-content'}\n`);

  const start = Date.now();

  try {
    const result = await compileBrandAssets({ brandKey: args.brand, force: args.force });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`\n✓ Done in ${elapsed}s`);
    console.log(`  Generated : ${result.generated.length} file(s)`);
    console.log(`  Skipped   : ${result.skipped.length} file(s)`);
    if (result.warnings.length) {
      console.log(`\n⚠ Warnings:`);
      result.warnings.forEach((w) => console.log(`  - ${w}`));
    }
    if (result.generated.length) {
      console.log('\nGenerated files:');
      result.generated.forEach((f) => console.log(`  ${f}`));
    }
  } catch (err) {
    console.error(`\n✗ Failed: ${err.message}`);
    process.exit(1);
  }
}

main();
