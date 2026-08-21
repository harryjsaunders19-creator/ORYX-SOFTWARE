#!/usr/bin/env node
/**
 * Optional planner check for migration 047 trigram indexes.
 *
 * Uses @electric-sql/pglite + pg_trgm contrib (dev-only; not part of npm test).
 * Prints BEFORE/AFTER EXPLAIN (COSTS OFF) for representative search shapes.
 *
 * Usage:
 *   node scripts/verify-search-trgm-plans.mjs
 */
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execSync } from "node:child_process"

const dir = mkdtempSync(join(tmpdir(), "oryx-trgm-"))

function sh(cmd) {
  execSync(cmd, { cwd: dir, stdio: "inherit" })
}

try {
  sh("npm init -y >/dev/null 2>&1")
  sh("npm install @electric-sql/pglite --no-save --silent")
} catch (err) {
  console.error("[verify-search-trgm] Could not install pglite:", err.message)
  process.exit(1)
}

const { PGlite } = await import(join(dir, "node_modules/@electric-sql/pglite/dist/index.js"))
const { pg_trgm } = await import(join(dir, "node_modules/@electric-sql/pglite/dist/contrib/pg_trgm.js"))

const db = new PGlite({ extensions: { pg_trgm } })
await db.exec(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`)

await db.exec(`
CREATE TABLE jobs (
  id text primary key,
  drawing_number text,
  address text,
  client_company text,
  requested_by text,
  type_of_works text,
  custom_type_description text,
  designer text,
  quote_reference text,
  parent_job_id text,
  archived_at timestamptz,
  status text,
  client_id text,
  list_sort_key text,
  created_at timestamptz default now()
);
CREATE TABLE clients (
  id text primary key,
  name_lower text,
  contact_name text,
  email text,
  phone text,
  account_code text
);
CREATE TABLE quotes (
  id text primary key,
  quote_number text,
  client_company text,
  address text,
  description text
);
`)

const jobs = []
for (let i = 0; i < 6000; i++) {
  jobs.push(
    `('j${i}','DN/${String(i).padStart(5, "0")}/X/24','Site ${i} Road','Client Co ${i % 250}','Req','Scaffold',null,'Designer A',null,null,null,'IN_PROGRESS','c1','K${i}',now())`,
  )
}
jobs.push(
  `('jhit','ACM-12345/ORYX/25','Acme Yard 12 High Street','Acme Scaffolding Ltd','Bob','Scaffold','Custom','Jane','Q-99',null,null,'IN_PROGRESS','c2','Khit',now())`,
)
for (let b = 0; b < jobs.length; b += 500) {
  await db.exec(`INSERT INTO jobs VALUES ${jobs.slice(b, b + 500).join(",")}`)
}

const clients = []
for (let i = 0; i < 2500; i++) {
  clients.push(`('c${i}','client ${i}','Contact ${i}','c${i}@ex.com','07${i}','A${i}')`)
}
clients.push(`('chit','acme scaffolding ltd','Bob','bob@acme.com','07111','ACM1')`)
await db.exec(`INSERT INTO clients VALUES ${clients.join(",")}`)

const quotes = []
for (let i = 0; i < 4000; i++) {
  quotes.push(`('q${i}','Q-2024-${i}','Client ${i % 180}','Addr ${i}','desc ${i}')`)
}
quotes.push(`('qhit','Q-2025-ACME-01','Acme Scaffolding Ltd','High Street','scaffold package')`)
await db.exec(`INSERT INTO quotes VALUES ${quotes.join(",")}`)

async function plan(label, sql) {
  const r = await db.query(`EXPLAIN (COSTS OFF) ${sql}`)
  console.log(`\n## ${label}`)
  console.log(r.rows.map(x => x["QUERY PLAN"]).join("\n"))
}

const jobsOr = `drawing_number ILIKE '%acme%' OR address ILIKE '%acme%' OR client_company ILIKE '%acme%' OR requested_by ILIKE '%acme%' OR type_of_works ILIKE '%acme%' OR custom_type_description ILIKE '%acme%' OR designer ILIKE '%acme%' OR quote_reference ILIKE '%acme%'`
const clientsOr = `name_lower ILIKE '%acme%' OR contact_name ILIKE '%acme%' OR email ILIKE '%acme%' OR phone ILIKE '%acme%' OR account_code ILIKE '%acme%'`
const quotesOr = `quote_number ILIKE '%acme%' OR client_company ILIKE '%acme%' OR address ILIKE '%acme%' OR description ILIKE '%acme%'`

await plan("BEFORE jobs OR", `SELECT id FROM jobs WHERE parent_job_id IS NULL AND archived_at IS NULL AND (${jobsOr})`)
await plan("BEFORE clients OR", `SELECT id FROM clients WHERE ${clientsOr}`)
await plan("BEFORE quotes OR", `SELECT id FROM quotes WHERE ${quotesOr}`)
await plan("BEFORE no-search jobs", `SELECT id FROM jobs WHERE parent_job_id IS NULL AND archived_at IS NULL ORDER BY list_sort_key, created_at LIMIT 25`)

await db.exec(`
CREATE INDEX idx_jobs_drawing_number_trgm ON jobs USING gin (drawing_number gin_trgm_ops);
CREATE INDEX idx_jobs_address_trgm ON jobs USING gin (address gin_trgm_ops);
CREATE INDEX idx_jobs_client_company_trgm ON jobs USING gin (client_company gin_trgm_ops);
CREATE INDEX idx_jobs_requested_by_trgm ON jobs USING gin (requested_by gin_trgm_ops);
CREATE INDEX idx_jobs_type_of_works_trgm ON jobs USING gin (type_of_works gin_trgm_ops);
CREATE INDEX idx_jobs_custom_type_description_trgm ON jobs USING gin (custom_type_description gin_trgm_ops);
CREATE INDEX idx_jobs_designer_trgm ON jobs USING gin (designer gin_trgm_ops);
CREATE INDEX idx_jobs_quote_reference_trgm ON jobs USING gin (quote_reference gin_trgm_ops);
CREATE INDEX idx_clients_name_lower_trgm ON clients USING gin (name_lower gin_trgm_ops);
CREATE INDEX idx_clients_contact_name_trgm ON clients USING gin (contact_name gin_trgm_ops);
CREATE INDEX idx_clients_email_trgm ON clients USING gin (email gin_trgm_ops);
CREATE INDEX idx_clients_phone_trgm ON clients USING gin (phone gin_trgm_ops);
CREATE INDEX idx_clients_account_code_trgm ON clients USING gin (account_code gin_trgm_ops);
CREATE INDEX idx_quotes_quote_number_trgm ON quotes USING gin (quote_number gin_trgm_ops);
CREATE INDEX idx_quotes_client_company_trgm ON quotes USING gin (client_company gin_trgm_ops);
CREATE INDEX idx_quotes_address_trgm ON quotes USING gin (address gin_trgm_ops);
CREATE INDEX idx_quotes_description_trgm ON quotes USING gin (description gin_trgm_ops);
ANALYZE jobs; ANALYZE clients; ANALYZE quotes;
`)

await plan("AFTER jobs OR (selective)", `SELECT id FROM jobs WHERE parent_job_id IS NULL AND archived_at IS NULL AND (${jobsOr})`)
await plan("AFTER clients OR", `SELECT id FROM clients WHERE ${clientsOr}`)
await plan("AFTER quotes OR", `SELECT id FROM quotes WHERE ${quotesOr}`)
await plan("AFTER no-search jobs", `SELECT id FROM jobs WHERE parent_job_id IS NULL AND archived_at IS NULL ORDER BY list_sort_key, created_at LIMIT 25`)
await plan("AFTER drawing only", `SELECT id FROM jobs WHERE drawing_number ILIKE '%acm-123%'`)
await plan("AFTER strpos (not indexable)", `SELECT id FROM jobs WHERE strpos(lower(coalesce(drawing_number,'')), lower('acme')) > 0`)

await db.exec(`SET enable_seqscan = off`)
await plan("DIAG enable_seqscan=off jobs OR", `SELECT id FROM jobs WHERE ${jobsOr}`)
await db.exec(`SET enable_seqscan = on`)

await db.close()
rmSync(dir, { recursive: true, force: true })
console.log("\n[verify-search-trgm] done")
