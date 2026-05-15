/**
 * One-time helper: create backend/.env from .env.example (skipped if .env exists).
 * Run from backend/: `npm run env:init`
 */
const fs = require("node:fs");
const path = require("node:path");

const dir = path.join(__dirname, "..");
const dest = path.join(dir, ".env");
const src = path.join(dir, ".env.example");

if (!fs.existsSync(src)) {
  console.error("Missing .env.example in backend folder.");
  process.exit(1);
}
if (fs.existsSync(dest)) {
  console.log(".env already exists — skipped");
  process.exit(0);
}
fs.copyFileSync(src, dest);
console.log("Created .env from .env.example");
console.log("Edit DATABASE_URL for your PostgreSQL instance, then run npm run dev");
