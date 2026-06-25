/**
 * One-time script to set up passwords for existing users.
 * Run on the production server after deploying:
 *
 *   node scripts/setup-passwords.js
 */
const { existsSync } = require("fs")
const path = require("path")

const root = path.join(__dirname, "..")
let dbPath = process.env.DB_PATH || path.join(root, ".data", "oryx.db")
const oldPath = path.join(root, "prisma", "oryx.db")

if (!existsSync(dbPath) && existsSync(oldPath)) {
  dbPath = oldPath
}
if (!existsSync(dbPath)) {
  console.error("Database not found at", dbPath, "or", oldPath)
  console.error("Start the app once first, then re-run this script.")
  process.exit(1)
}

console.log("Using database:", dbPath)

const Database = require("better-sqlite3")
const bcrypt = require("bcryptjs")
const db = new Database(dbPath)

const cols = db.prepare("PRAGMA table_info(User)").all().map(function(c) { return c.name })
if (cols.indexOf("passwordHash") === -1) {
  db.exec("ALTER TABLE User ADD COLUMN passwordHash TEXT")
  console.log("Added passwordHash column")
}
if (cols.indexOf("mustChangePassword") === -1) {
  db.exec("ALTER TABLE User ADD COLUMN mustChangePassword INTEGER NOT NULL DEFAULT 0")
  console.log("Added mustChangePassword column")
}

function hash(pw) { return bcrypt.hashSync(pw, 12) }
function rid() { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) }

var admin = db.prepare("SELECT id FROM User WHERE emailLower = ?").get("admin@test.com")
if (!admin) {
  var now = new Date().toISOString()
  db.prepare("INSERT INTO User (id,name,email,emailLower,role,active,passwordHash,mustChangePassword,createdAt,updatedAt) VALUES (?,?,?,?,?,1,?,0,?,?)")
    .run(rid(), "Admin", "admin@test.com", "admin@test.com", "ADMIN", hash("admin123"), now, now)
  console.log("Created admin@test.com  password: admin123")
} else {
  db.prepare("UPDATE User SET passwordHash=?, mustChangePassword=0 WHERE id=?").run(hash("admin123"), admin.id)
  console.log("Set password for admin@test.com  password: admin123")
}

var eng = db.prepare("SELECT id FROM User WHERE emailLower = ?").get("engineer@test.com")
if (eng) {
  db.prepare("UPDATE User SET passwordHash=?, mustChangePassword=0 WHERE id=?").run(hash("engineer123"), eng.id)
  console.log("Set password for engineer@test.com  password: engineer123")
}

var noPass = db.prepare("SELECT id, name, email FROM User WHERE passwordHash IS NULL").all()
for (var i = 0; i < noPass.length; i++) {
  var u = noPass[i]
  db.prepare("UPDATE User SET passwordHash=?, mustChangePassword=1 WHERE id=?").run(hash("changeme"), u.id)
  console.log("Set temp password for " + u.name + " (" + (u.email || "no email") + ")  password: changeme")
}

var users = db.prepare("SELECT name, email, role, active, mustChangePassword FROM User ORDER BY name").all()
console.log("\n-- Users --")
users.forEach(function(u) {
  console.log("  " + u.name + " | " + (u.email || "-") + " | " + u.role + " | " + (u.active ? "active" : "disabled") + " | must change: " + (u.mustChangePassword ? "yes" : "no"))
})
console.log("\nDone. Log in with admin@test.com / admin123")
db.close()
