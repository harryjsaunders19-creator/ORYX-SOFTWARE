/**
 * scripts/setup-passwords.mjs
 *
 * One-time migration helper: ensure every SQLite user has a password hash.
 * Does NOT create or reset known test accounts (admin@test.com / engineer@test.com).
 * Those are only provisioned via guarded E2E/test bootstrap.
 *
 * Usage:
 *   node scripts/setup-passwords.mjs
 */
import { existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { createRequire } from "module"
import { randomBytes } from "crypto"

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")

const bcrypt = require("bcryptjs")
const Database = require("better-sqlite3")

const TEST_EMAILS = new Set(["admin@test.com", "engineer@test.com"])

const dbPath = process.env.DB_PATH ?? join(root, ".data", "oryx.db")
const oldPath = join(root, "prisma", "oryx.db")

let actualPath = dbPath
if (!existsSync(dbPath) && existsSync(oldPath)) {
  actualPath = oldPath
  console.log(`Database found at legacy path: ${oldPath}`)
} else if (!existsSync(dbPath)) {
  console.error(`Database not found at ${dbPath} or ${oldPath}`)
  console.error("Start the app once first to create the database, then re-run this script.")
  process.exit(1)
}

console.log(`Using database: ${actualPath}`)
const db = new Database(actualPath)

const cols = db.prepare("PRAGMA table_info(User)").all().map(c => c.name)
if (!cols.includes("passwordHash")) {
  db.exec("ALTER TABLE User ADD COLUMN passwordHash TEXT")
  console.log("✓ Added passwordHash column")
}
if (!cols.includes("mustChangePassword")) {
  db.exec("ALTER TABLE User ADD COLUMN mustChangePassword INTEGER NOT NULL DEFAULT 0")
  console.log("✓ Added mustChangePassword column")
}

const hash = (pw) => bcrypt.hashSync(pw, 12)

const noPass = db.prepare("SELECT id, name, email, emailLower FROM User WHERE passwordHash IS NULL").all()
let setCount = 0
for (const u of noPass) {
  if (u.emailLower && TEST_EMAILS.has(u.emailLower)) {
    console.warn(`⏭ Skipping test account ${u.emailLower} — use guarded E2E bootstrap instead`)
    continue
  }
  const temp = randomBytes(12).toString("base64url")
  db.prepare("UPDATE User SET passwordHash = ?, mustChangePassword = 1 WHERE id = ?")
    .run(hash(temp), u.id)
  setCount++
  // Print temp once to stdout for the operator — never write passwords to structured logs.
  console.log(`✓ Set one-time temp password for ${u.name} (${u.email ?? "no email"}) — must change on login`)
  console.log(`  temporary password: ${temp}`)
}

const users = db.prepare(`
  SELECT name, email, role, active, mustChangePassword,
         CASE WHEN passwordHash IS NOT NULL THEN 'yes' ELSE 'no' END as hasPassword
  FROM User ORDER BY name
`).all()

console.log("\n── Users ──")
for (const u of users) {
  console.log(`  ${u.name} | ${u.email ?? "—"} | ${u.role} | ${u.active ? "active" : "disabled"} | password: ${u.hasPassword} | must change: ${u.mustChangePassword ? "yes" : "no"}`)
}

console.log(`\nDone. Updated ${setCount} user(s) without passwords.`)
db.close()
