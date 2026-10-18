// QuantFolio — data cleanup utility
// Usage: node clean.js <target> [target...] [--vacuum]   (or: npm run clean -- ...)
// Targets: portfolio | accuracy | users | cache | all
// --vacuum: repack the DB file to reclaim disk space after deletes.
// Override DB path with env QF_DB=<path>.
"use strict";

const path = require("path");
const Database = require("better-sqlite3");

const TARGETS = {
  portfolio: ["holdings"],
  accuracy: ["predictions", "actual_snapshots"],
  users: ["users", "sessions"],
  cache: ["live_prices", "mf_codes"],
};

const rawArgs = process.argv.slice(2).map((a) => a.toLowerCase());
const vacuum = rawArgs.includes("--vacuum");
const args = rawArgs.filter((a) => a !== "--vacuum");

if ((!args.length && !vacuum) || args.includes("help") || args.includes("-h") || args.includes("--help")) {
  console.log(`QuantFolio clean

Usage: node clean.js <target> [target...] [--vacuum]

Targets:
  portfolio   saved holdings
  accuracy    predictions + price snapshots
  users       login accounts + active sessions
  cache       cached live prices + MF scheme codes
  all         everything above

Flags:
  --vacuum    repack the DB file to reclaim disk space (stop server first)

Examples:
  node clean.js portfolio
  node clean.js accuracy users
  node clean.js all --vacuum
  node clean.js --vacuum
`);
  process.exit(args.length || vacuum ? 0 : 1);
}

const unknown = args.filter((a) => a !== "all" && !TARGETS[a]);
if (unknown.length) {
  console.error("Unknown target(s): " + unknown.join(", "));
  console.error("Valid targets: " + Object.keys(TARGETS).join(", ") + ", all");
  process.exit(1);
}

const wanted = args.includes("all") ? Object.keys(TARGETS) : [...new Set(args)];
const tables = [...new Set(wanted.flatMap((t) => TARGETS[t]))];

const dbPath = process.env.QF_DB || path.join(__dirname, "quantfolio.db");
const db = new Database(dbPath);
db.pragma("busy_timeout = 5000");

const present = new Set(
  db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name),
);

let total = 0;
for (const t of tables) {
  if (!present.has(t)) continue;
  const n = db.prepare(`DELETE FROM ${t}`).run().changes;
  total += n;
  console.log(`  cleared ${t}: ${n} row(s)`);
}

console.log(`\nDone. ${total} row(s) removed from ${dbPath}`);

if (vacuum) {
  try {
    db.exec("VACUUM");
    console.log("  vacuumed (disk space reclaimed)");
  } catch (e) {
    console.error("  VACUUM failed — stop the server and retry: " + e.message);
  }
}

db.close();
