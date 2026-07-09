/**
 * Verify Supabase env vars and connection (Step 3 setup check).
 *
 * Usage:
 *   npm run supabase:check
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
import { existsSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const envPath = join(root, ".env.local")

function loadEnvLocal() {
  if (!existsSync(envPath)) return false
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
  return true
}

console.log("Checking Supabase setup…\n")

if (!loadEnvLocal()) {
  console.error("✗ .env.local not found")
  console.error("  Create it in the project root:")
  console.error("    cp .env.example .env.local")
  console.error("  Then add your Supabase URL and anon key from the dashboard.")
  process.exit(1)
}

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  process.env.SUPABASE_URL?.trim()
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.SUPABASE_PUBLISHABLE_KEY?.trim()

if (!url || !anonKey) {
  console.error("✗ Missing env vars in .env.local:")
  if (!url) console.error("    NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)")
  if (!anonKey) console.error("    NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)")
  console.error("\n  Get both from Supabase Dashboard → Project Settings → API")
  process.exit(1)
}

console.log("✓ .env.local found")
console.log(`✓ NEXT_PUBLIC_SUPABASE_URL = ${url}`)

try {
  const health = await fetch(`${url}/auth/v1/health`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  })
  if (!health.ok) {
    console.error(`✗ Supabase health check failed (HTTP ${health.status})`)
    console.error("  Check your URL and anon key in the dashboard.")
    process.exit(1)
  }
  console.log("✓ Supabase health endpoint reachable")

  const supabase = createClient(url, anonKey)
  const { error } = await supabase.auth.getSession()
  if (error) {
    console.warn("⚠ Auth API returned:", error.message)
  } else {
    console.log("✓ Supabase client created successfully")
  }

  console.log("\nSuccess — Supabase is connected. The app still uses SQLite for data.")
} catch (err) {
  console.error("✗ Could not reach Supabase:", err instanceof Error ? err.message : err)
  process.exit(1)
}
