/**
 * scripts/setup-db.mjs
 *
 * Runs after `npm install`. Creates the SQLite database if it doesn't exist.
 * Uses Node's built-in sqlite module (Node 22+) for the setup check only.
 * The actual DB creation happens lazily via better-sqlite3 in lib/db.ts.
 */

import { existsSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root      = join(__dirname, "..")
const dbPath    = join(root, ".data", "oryx.db")

mkdirSync(join(root, ".data"), { recursive: true })

if (!existsSync(dbPath)) {
  console.log("ℹ  Database will be created on first server start at:", dbPath)
} else {
  console.log("✓  Database exists:", dbPath)
}

console.log("✓  Setup complete — run `npm run dev` to start")
