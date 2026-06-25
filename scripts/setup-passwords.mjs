/**
 * scripts/setup-passwords.mjs
 *
 * One-time script to set up passwords for existing users after the
 * password lifecycle feature is deployed. Run this on the production
 * server after deploying the new code:
 *
 *   node scripts/setup-passwords.mjs
 *
 * It will:
 *   1. Add passwordHash/mustChangePassword columns if missing
 *   2. Create an admin@test.com account if none exists
 *   3. Set passwords for admin@test.com and engineer@test.com
 *   4. Give all other users a temp password (changeme) with mustChangePassword=1
 */
import { existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")

const bcrypt = require("bcryptjs")
const Database = require("better-sqlite3")

// Find the database
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

// Step 1: Add columns if missing
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
const nanoid = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)

// Step 2: Ensure admin@test.com exists
let admin = db.prepare("SELECT id FROM User WHERE emailLower = ?").get("admin@test.com")
if (!admin) {
  const id = nanoid()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO User (id, name, email, emailLower, role, active, passwordHash, mustChangePassword, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, 1, ?, 0, ?, ?)
  `).run(id, "Admin", "admin@test.com", "admin@test.com", "ADMIN", hash("admin123"), now, now)
  console.log("✓ Created admin@test.com (password: admin123)")
} else {
  db.prepare("UPDATE User SET passwordHash = ?, mustChangePassword = 0 WHERE id = ?")
    .run(hash("admin123"), admin.id)
  console.log("✓ Set password for admin@test.com (password: admin123)")
}

// Step 3: Set engineer@test.com password if exists
const eng = db.prepare("SELECT id FROM User WHERE emailLower = ?").get("engineer@test.com")
if (eng) {
  db.prepare("UPDATE User SET passwordHash = ?, mustChangePassword = 0 WHERE id = ?")
    .run(hash("engineer123"), eng.id)
  console.log("✓ Set password for engineer@test.com (password: engineer123)")
}

// Step 4: Any users without a password get a temp one
const noPass = db.prepare("SELECT id, name, email FROM User WHERE passwordHash IS NULL").all()
for (const u of noPass) {
  db.prepare("UPDATE User SET passwordHash = ?, mustChangePassword = 1 WHERE id = ?")
    .run(hash("changeme"), u.id)
  console.log(`✓ Set temp password for ${u.name} (${u.email ?? "no email"}) → password: changeme (must change on login)`)
}

// Summary
const users = db.prepare(`
  SELECT name, email, role, active, mustChangePassword,
         CASE WHEN passwordHash IS NOT NULL THEN 'yes' ELSE 'no' END as hasPassword
  FROM User ORDER BY name
`).all()

console.log("\n── Users ──")
for (const u of users) {
  console.log(`  ${u.name} | ${u.email ?? "—"} | ${u.role} | ${u.active ? "active" : "disabled"} | password: ${u.hasPassword} | must change: ${u.mustChangePassword ? "yes" : "no"}`)
}

console.log("\nDone. You can now log in with admin@test.com / admin123")
db.close()
