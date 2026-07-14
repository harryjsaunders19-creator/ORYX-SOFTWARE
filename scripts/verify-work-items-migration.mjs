/**
 * Verify parent_jobs + work_items migration in SQLite and/or Supabase.
 *
 * Usage: npm run verify:work-items
 */
import { existsSync } from "fs"
import { join } from "path"
import { createRequire } from "module"
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, projectRoot } from "./load-env-local.mjs"

const require = createRequire(import.meta.url)

console.log("Verifying work-items migration…\n")

loadEnvLocal()

const dbPath = process.env.DB_PATH ?? join(projectRoot, ".data", "oryx.db")
const errors = []

function check(label, ok, detail) {
  if (ok) console.log(`✓ ${label}: ${detail}`)
  else {
    console.error(`✗ ${label}: ${detail}`)
    errors.push(`${label}: ${detail}`)
  }
}

function isDesignParent(job) {
  return job.parentJobId == null && job.itemType === "DESIGN"
}

function isDesignRevision(job, parentIds) {
  return job.parentJobId != null && parentIds.has(job.parentJobId)
}

if (existsSync(dbPath)) {
  const Database = require("better-sqlite3")
  const db = new Database(dbPath, { readonly: true })

  const parentTable = (
    db.prepare("SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='ParentJob'").get()
  ).n > 0

  check("SQLite schema", parentTable, parentTable ? "ParentJob table exists" : "ParentJob table missing — restart dev server")

  if (parentTable) {
    const jobs = db.prepare("SELECT id, itemType, parentJobId FROM Job").all()
    const designParents = jobs.filter(isDesignParent)
    const parentIds = new Set(designParents.map(p => p.id))
    const revisions = jobs.filter(j => isDesignRevision(j, parentIds))

    const parentCount = db.prepare("SELECT COUNT(*) as n FROM ParentJob").get().n
    const workItemCount = db.prepare("SELECT COUNT(*) as n FROM WorkItem").get().n
    const originalCount = db.prepare("SELECT COUNT(*) as n FROM WorkItem WHERE workType = 'ORIGINAL'").get().n
    const revisionCount = db.prepare("SELECT COUNT(*) as n FROM WorkItem WHERE workType = 'REVISION'").get().n

    check("SQLite parent count", parentCount === designParents.length, `${parentCount} / ${designParents.length}`)
    check(
      "SQLite work item count",
      workItemCount === designParents.length + revisions.length,
      `${workItemCount} / ${designParents.length + revisions.length}`,
    )
    check("SQLite originals", originalCount === designParents.length, `${originalCount} / ${designParents.length}`)
    check("SQLite revisions", revisionCount === revisions.length, `${revisionCount} / ${revisions.length}`)

    const unmappedHistory = db.prepare(`
      SELECT COUNT(*) as n FROM StatusHistory sh
      INNER JOIN WorkItemIdMap m ON m.legacyJobId = sh.jobId
      WHERE sh.workItemId IS NULL
    `).get().n
    check("SQLite status history FK", unmappedHistory === 0, unmappedHistory === 0 ? "all mapped" : `${unmappedHistory} unmapped`)

    if (parentCount === 0) {
      console.log("→ Run: npm run migrate:work-items")
    }
  }
} else {
  console.log("○ SQLite database not found — skipping local checks")
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (url && key) {
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const { error: parentErr, count: parentCount } = await supabase
    .from("parent_jobs")
    .select("*", { count: "exact", head: true })

  if (parentErr) {
    if (parentErr.message.includes("does not exist") || parentErr.code === "42P01") {
      console.log("\n○ Supabase parent_jobs not created yet — run 030_parent_jobs_work_items.sql")
    } else {
      console.error("\n✗ Supabase error:", parentErr.message)
      errors.push(`Supabase: ${parentErr.message}`)
    }
  } else {
    const { count: workItemCount } = await supabase
      .from("work_items")
      .select("*", { count: "exact", head: true })

    console.log(`\n✓ Supabase parent_jobs: ${parentCount ?? 0}`)
    console.log(`✓ Supabase work_items:  ${workItemCount ?? 0}`)

    if ((parentCount ?? 0) === 0) {
      console.log("→ Run 030 migration, then npm run supabase:sync-work-items")
    }
  }
} else {
  console.log("\n○ Supabase credentials not set — skipping remote checks")
}

if (process.env.WORK_ITEMS_MODEL === "true") {
  console.log("\n✓ WORK_ITEMS_MODEL=true")
} else {
  console.log("\n○ WORK_ITEMS_MODEL not enabled — legacy jobs table still active (expected for Phase 1)")
}

if (errors.length > 0) {
  console.error(`\n${errors.length} check(s) failed`)
  process.exit(1)
}

console.log("\nAll checks passed.")
process.exit(0)
