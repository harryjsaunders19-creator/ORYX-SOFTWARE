/**
 * Copy all quotes + line items from SQLite → Supabase.
 *
 * Usage: npm run supabase:sync-quotes
 */
import { existsSync } from "fs"
import { join } from "path"
import { createRequire } from "module"
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, projectRoot } from "./load-env-local.mjs"

const require = createRequire(import.meta.url)

loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}

const dbPath = process.env.DB_PATH ?? join(projectRoot, ".data", "oryx.db")
if (!existsSync(dbPath)) {
  console.error("SQLite database not found — run npm run dev once first.")
  process.exit(1)
}

function dateOnly(val) {
  if (!val) return null
  return String(val).slice(0, 10)
}

const Database = require("better-sqlite3")
const db = new Database(dbPath, { readonly: true })
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const quotes = db.prepare("SELECT * FROM Quote ORDER BY createdAt ASC").all()
console.log(`Found ${quotes.length} quote(s) in SQLite`)

let ok = 0
let failed = 0

for (const q of quotes) {
  const payload = {
    id: q.id,
    quote_number: q.quoteNumber,
    client_id: q.clientId,
    client_company: q.clientCompany,
    contact_name: q.contactName,
    address: q.address,
    description: q.description,
    type_of_works: q.typeOfWorks ?? null,
    custom_type_description: q.customTypeDescription ?? null,
    quote_value: q.quoteValue,
    quote_date: dateOnly(q.quoteDate),
    expiry_date: dateOnly(q.expiryDate),
    status: q.status,
    notes: q.notes,
    job_id: q.jobId,
    created_by: q.createdBy,
    pdf_path: q.pdfPath,
    prepared_by: q.preparedBy,
    vat_rate: q.vatRate,
    created_at: q.createdAt,
    updated_at: q.updatedAt,
  }

  const { error } = await supabase.from("quotes").upsert(payload, { onConflict: "id" })
  if (error) {
    console.error(`  ✗ ${q.quoteNumber}:`, error.message)
    if (error.message.includes("schema cache")) {
      console.error("     → Re-run 003_quotes.sql or reload schema in Supabase Dashboard")
    }
    failed++
    continue
  }

  const lines = db.prepare("SELECT * FROM QuoteLineItem WHERE quoteId = ? ORDER BY sortOrder ASC").all(q.id)
  await supabase.from("quote_line_items").delete().eq("quote_id", q.id)
  if (lines.length) {
    const linePayload = lines.map((li) => ({
      id: li.id,
      quote_id: li.quoteId,
      description: li.description,
      amount: li.amount,
      vat_applicable: li.vatApplicable === 1,
      sort_order: li.sortOrder,
      created_at: li.createdAt,
    }))
    const { error: lineErr } = await supabase.from("quote_line_items").insert(linePayload)
    if (lineErr) {
      console.error(`  ✗ ${q.quoteNumber} line items:`, lineErr.message)
      failed++
      continue
    }
  }

  console.log(`  ✓ ${q.quoteNumber}${lines.length ? ` (${lines.length} line items)` : ""}`)
  ok++
}

console.log(`\nDone: ${ok} synced, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
