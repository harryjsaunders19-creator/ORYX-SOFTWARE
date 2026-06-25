/**
 * scripts/check-db.mjs
 * Quick CLI health check for the SQLite database.
 */

import { createRequire } from "module"
import { join, dirname }  from "path"
import { fileURLToPath }  from "url"

const require   = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const root      = join(__dirname, "..")
const dbPath    = join(root, ".data", "oryx.db")

try {
  const Database = require("better-sqlite3")
  const db = new Database(dbPath)
  const jobs = db.prepare("SELECT COUNT(*) as n FROM Job").get()
  const seq  = db.prepare("SELECT COUNT(*) as n FROM DrawingSequence").get()
  console.log("✓  Database OK:", dbPath)
  console.log(`   Jobs: ${jobs.n}`)
  console.log(`   Drawing sequences: ${seq.n}`)
  db.close()
} catch (err) {
  console.error("✗  Database check failed:", err.message)
  process.exit(1)
}
