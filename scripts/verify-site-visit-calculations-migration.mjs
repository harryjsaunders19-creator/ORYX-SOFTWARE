/**
 * Verify site visit calculations migration.
 *
 * Usage: npm run supabase:verify-site-visit-calculations
 */
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal } from "./load-env-local.mjs"

console.log("Verifying site visit calculations migration…\n")

if (!loadEnvLocal()) {
  console.error("✗ .env.local not found")
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !serviceKey) {
  console.error("✗ Missing Supabase env vars")
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { error, count } = await supabase
  .from("site_visit_calculations")
  .select("*", { count: "exact", head: true })

if (error) {
  console.error("✗ site_visit_calculations:", error.message)
  console.error("\n  Run supabase/migrations/025_site_visit_calculations.sql (or npm run supabase:bootstrap).")
  process.exit(1)
}

console.log("✓ site_visit_calculations table exists")
console.log(`  saved calculations in Supabase: ${count ?? 0}`)

if (!process.env.ORS_API_KEY?.trim()) {
  console.log("\n⚠ Set ORS_API_KEY in production for reliable site visit routing (OpenRouteService)")
} else {
  console.log("\n✓ ORS_API_KEY is set")
}

console.log("\n✓ Site visit calculator migration OK")
