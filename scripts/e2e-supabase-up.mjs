#!/usr/bin/env node
/**
 * Start local Supabase (Docker), apply ORYX bootstrap schema, seed e2e users.
 *
 * Writes `.env.e2e` (gitignored) with Supabase URL/keys for Playwright.
 *
 * Usage (CI / local with Docker):
 *   node scripts/e2e-supabase-up.mjs
 */
import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
process.chdir(root)

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts })
}

function supabaseCmd(args) {
  try {
    execSync("supabase --version", { stdio: "ignore" })
    return `supabase ${args}`
  } catch {
    return `npx supabase ${args}`
  }
}

function parseEnvOutput(raw) {
  return Object.fromEntries(
    raw
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const i = line.indexOf("=")
        if (i < 0) return null
        const k = line.slice(0, i)
        let v = line.slice(i + 1)
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1)
        }
        return [k, v]
      })
      .filter(Boolean),
  )
}

console.log("[e2e-supabase] Starting local Supabase stack…")
try {
  sh(supabaseCmd("start -x realtime,logflare,vector,imgproxy"), { stdio: "inherit" })
} catch (err) {
  console.error("[e2e-supabase] supabase start failed. Docker is required.")
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}

const status = parseEnvOutput(sh(supabaseCmd("status -o env")))
const apiUrl = status.API_URL || status.SUPABASE_URL
const anonKey = status.ANON_KEY || status.SUPABASE_ANON_KEY
const serviceKey = status.SERVICE_ROLE_KEY || status.SUPABASE_SERVICE_ROLE_KEY
const dbUrl = status.DB_URL || status.POSTGRES_URL || status.DATABASE_URL

if (!apiUrl || !anonKey || !serviceKey) {
  console.error("[e2e-supabase] Could not parse supabase status keys:", status)
  process.exit(1)
}
if (!dbUrl) {
  console.error("[e2e-supabase] Could not parse DB_URL from supabase status:", status)
  process.exit(1)
}

console.log("[e2e-supabase] Applying ORYX bootstrap schema via psql…")
const dropSql = path.join(root, "supabase", "00-drop-all.sql")
const bootSql = path.join(root, "supabase", "01-bootstrap.sql")
const seedSql = path.join(root, "supabase", "seed-e2e-users.sql")
try {
  // Migrations are disabled in config.toml (duplicate version prefixes).
  sh(`psql "${dbUrl}" -v ON_ERROR_STOP=1 -f "${dropSql}"`, { stdio: "inherit" })
  sh(`psql "${dbUrl}" -v ON_ERROR_STOP=1 -f "${bootSql}"`, { stdio: "inherit" })
  sh(`psql "${dbUrl}" -v ON_ERROR_STOP=1 -f "${seedSql}"`, { stdio: "inherit" })
} catch (err) {
  console.error("[e2e-supabase] Schema apply failed:", err instanceof Error ? err.message : err)
  process.exit(1)
}

const authSecret = process.env.AUTH_SECRET?.trim() || "e2e-auth-secret-not-for-production"
const envBody = [
  `NEXT_PUBLIC_SUPABASE_URL=${apiUrl}`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`,
  `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
  `FORCE_SUPABASE_ONLY=true`,
  `E2E=true`,
  `AUTH_SECRET=${authSecret}`,
  `ALLOW_BOOTSTRAP_TEST_ACCOUNTS=true`,
  "",
].join("\n")

fs.writeFileSync(path.join(root, ".env.e2e"), envBody)
console.log("[e2e-supabase] Wrote .env.e2e")

process.env.NEXT_PUBLIC_SUPABASE_URL = apiUrl
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey

console.log("[e2e-supabase] Verifying e2e users via service role…")
sh("node scripts/e2e-seed-supabase-users.mjs", { stdio: "inherit", env: process.env })

console.log("[e2e-supabase] Ready.")
