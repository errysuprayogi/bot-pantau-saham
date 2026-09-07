#!/usr/bin/env node
// Patch stockbit-mcp (install global) agar tool market_movers mengirim parameter
// `filter_stocks` — empat papan saham (MAIN/DEVELOPMENT/ACCELERATION/NEW_ECONOMY) —
// sama persis seperti client resmi Stockbit. Tanpa filter ini, daftar mover didominasi
// structured warrant sehingga TOP GAINER/TOP LOSER tidak cocok dengan aplikasi Stockbit.
//
// Idempoten: aman dipanggil berkali-kali. Dipanggil dari deploy/cloud-init-gcp.sh dan
// deploy/Dockerfile SETELAH `npm install -g stockbit-mcp`.
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ANCHOR =
  'if (opts.limit !== undefined)\n' +
  '        params.limit = positiveInt("limit", opts.limit);\n' +
  '    return cached(keyFor("marketMover", params), CACHE.defaultTtlMs, async () => {';

const REPLACEMENT =
  'if (opts.limit !== undefined)\n' +
  '        params.limit = positiveInt("limit", opts.limit);\n' +
  '    // Stockbit\'s own client sends this filter on every market-mover call: it restricts the\n' +
  '    // ranking to the four stock boards and excludes structured warrants and other derivative\n' +
  '    // instruments, which otherwise dominate the top of the list.\n' +
  '    params.filter_stocks = [\n' +
  '        "FILTER_STOCKS_TYPE_MAIN_BOARD",\n' +
  '        "FILTER_STOCKS_TYPE_DEVELOPMENT_BOARD",\n' +
  '        "FILTER_STOCKS_TYPE_ACCELERATION_BOARD",\n' +
  '        "FILTER_STOCKS_TYPE_NEW_ECONOMY_BOARD",\n' +
  '    ];\n' +
  '    return cached(keyFor("marketMover", params), CACHE.defaultTtlMs, async () => {';

function npmGlobalRoot() {
  try {
    return execSync("npm root -g", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function main() {
  let file = process.argv[2] || process.env.STOCKBIT_MCP_MARKET_JS;
  if (file) {
    file = path.resolve(file);
  } else {
    const root = npmGlobalRoot();
    if (root) file = path.join(root, "stockbit-mcp", "dist", "src", "core", "market.js");
    if (!file || !fs.existsSync(file)) {
      console.error("[patch-stockbit-mcp] stockbit-mcp/dist/src/core/market.js tidak ditemukan.");
      if (root) console.error("  dicari di:", path.join(root, "stockbit-mcp", "dist", "src", "core", "market.js"));
      else console.error("  `npm root -g` tidak menghasilkan path.");
      process.exit(1);
    }
  }

  if (!fs.existsSync(file)) {
    console.error("[patch-stockbit-mcp] file tidak ditemukan:", file);
    process.exit(1);
  }

  const source = fs.readFileSync(file, "utf8");
  if (source.includes("params.filter_stocks")) {
    console.log("[patch-stockbit-mcp] sudah ter-patch, tidak ada perubahan:", file);
    return;
  }
  if (!source.includes(ANCHOR)) {
    console.error("[patch-stockbit-mcp] anchor tidak ditemukan di:", file);
    console.error("  Versi stockbit-mcp mungkin berubah — patch TIDAK diterapkan. Periksa getMarketMovers.");
    process.exit(1);
  }

  fs.writeFileSync(file, source.replace(ANCHOR, REPLACEMENT));
  console.log("[patch-stockbit-mcp] OK, filter_stocks diterapkan:", file);
}

main();