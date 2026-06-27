/**
 * lib/db/connection.ts — SQLite connection singleton.
 */
import Database from "better-sqlite3"
import path from "path"
import fs from "fs"

const DB_DIR  = process.env.DB_PATH
  ? path.dirname(process.env.DB_PATH)
  : path.join(/* turbopackIgnore: true */ process.cwd(), ".data")
const DB_PATH = process.env.DB_PATH ?? path.join(DB_DIR, "oryx.db")
const DB_EXISTED = fs.existsSync(DB_PATH)
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
console.log(`[db] DB_PATH=${DB_PATH} | existed=${DB_EXISTED} | DB_PATH env=${process.env.DB_PATH ?? "(not set)"}`)

if (!process.env.DB_PATH) {
  const oldPath = path.join(/* turbopackIgnore: true */ process.cwd(), "prisma", "oryx.db")
  if (fs.existsSync(oldPath) && !fs.existsSync(DB_PATH)) {
    for (const suffix of ["", "-shm", "-wal"]) {
      const src = oldPath + suffix
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, DB_PATH + suffix)
      }
    }
    console.log(`[db] Migrated database from prisma/oryx.db to .data/oryx.db`)
  }
}

function openDb(): InstanceType<typeof Database> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const conn = new Database(DB_PATH)
      conn.pragma("journal_mode = WAL")
      conn.pragma("foreign_keys = ON")
      conn.pragma("busy_timeout = 10000")
      conn.pragma("synchronous  = NORMAL")
      return conn
    } catch (err: unknown) {
      if (attempt < 4 && err instanceof Error && err.message.includes("locked")) {
        const ms = 1000 * (attempt + 1)
        console.log(`[db] Database locked, retrying in ${ms}ms (attempt ${attempt + 1}/5)`)
        const start = Date.now(); while (Date.now() - start < ms) { /* busy wait */ }
        continue
      }
      throw err
    }
  }
  throw new Error("Failed to open database after 5 attempts")
}

export const db = openDb()
export { DB_PATH, DB_DIR, DB_EXISTED }
