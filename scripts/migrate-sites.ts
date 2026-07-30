/**
 * Run Site backfill against the local SQLite database and write a migration report.
 *
 *   npm run migrate:sites
 */
import { writeFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"

async function main() {
  // Importing schema/connection runs ensure* migrations including Site tables.
  await import("../lib/db/schema")
  const { migrateLegacySitesSqlite } = await import("../modules/sites/lib/migrate-sites")
  const report = migrateLegacySitesSqlite()

  const outDir = resolve(process.cwd(), "tmp")
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, "site-migration-report.json")
  writeFileSync(outPath, JSON.stringify(report, null, 2))

  console.log("Site migration complete")
  console.log(`  sites created:       ${report.sitesCreated}`)
  console.log(`  jobs linked:         ${report.jobsLinked}`)
  console.log(`  parent jobs linked:  ${report.parentJobsLinked}`)
  console.log(`  probable duplicates: ${report.probableDuplicates.length}`)
  console.log(`  ambiguous jobs:      ${report.ambiguousJobs.length}`)
  console.log(`  missing site data:   ${report.jobsMissingSiteData.length}`)
  console.log(`  report: ${outPath}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
