#!/usr/bin/env node
/**
 * Upsert e2e test users into Supabase (stable passwords, must_change=false).
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_* aliases).
 *
 * Usage:
 *   node scripts/e2e-seed-supabase-users.mjs
 */
import { createClient } from "@supabase/supabase-js"

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  process.env.SUPABASE_URL?.trim()
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.SUPABASE_SECRET_KEY?.trim()

if (!url || !key) {
  console.error("[e2e-seed] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const users = [
  {
    id: "bootstrap-admin-00000001",
    name: "Admin",
    email: "admin@test.com",
    email_lower: "admin@test.com",
    role: "ADMIN",
    active: true,
    password_hash: "$2b$12$92nRgb8jPt20D4.fPVhIOudgpnPaAozVDOxbw32dArHspiSFy2OGS",
    must_change_password: false,
  },
  {
    id: "bootstrap-engineer-00000001",
    name: "Engineer",
    email: "engineer@test.com",
    email_lower: "engineer@test.com",
    role: "ENGINEER",
    active: true,
    password_hash: "$2b$12$NWRIw4dbY47HJRDhOZStaOuY7s4Js.emZPm9QMHJysvYgj1gOrB7u",
    must_change_password: false,
  },
]

const now = new Date().toISOString()
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

for (const u of users) {
  const { error } = await admin.from("app_users").upsert(
    {
      ...u,
      created_at: now,
      updated_at: now,
    },
    { onConflict: "email_lower" },
  )
  if (error) {
    console.error(`[e2e-seed] Failed to upsert ${u.email}:`, error.message)
    process.exit(1)
  }
  console.log(`[e2e-seed] Upserted ${u.email}`)
}
