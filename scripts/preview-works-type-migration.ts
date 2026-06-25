/**
 * Preview the Type of Works migration's decisions for a list of legacy
 * values, without touching any database — pure classification logic only.
 *
 * Usage:
 *   npx tsx scripts/preview-works-type-migration.ts
 *     → runs against the demo set below (seed data + a few synthetic edge cases)
 *
 *   npx tsx scripts/preview-works-type-migration.ts values.json
 *     → runs against your own list. values.json should be a JSON array of
 *       strings, e.g. ["Bird Cage", "Temp Roof", "Façade Scaffold"].
 *       To get your real list from a live database, run once the app is
 *       deployed:
 *         sqlite3 prisma/oryx.db \
 *           "SELECT DISTINCT typeOfWorks FROM Job WHERE itemType IN ('DESIGN','REVISION');" \
 *         | node -e "console.log(JSON.stringify(require('fs').readFileSync(0,'utf8').trim().split('\n')))" \
 *         > values.json
 *       then run this script against values.json before the app's normal
 *       startup migration ever touches the real rows — so you can review the
 *       mapping/review-flag decisions ahead of time and add aliases for
 *       anything you'd rather have auto-map than land in "Other".
 */
import fs from "fs"
import { classifyLegacyWorksType } from "../lib/works-type-migration"

const DEMO_VALUES = [
  // Every unique value actually present in prisma/seed.ts
  "Temporary Roof", "Façade Scaffold", "Gantry & Loading Bay", "Birdcage Scaffold",
  "Cantilever Platform", "Tube & Fitting", "System Scaffold",
  // Synthetic cases exercising the alias dictionary and edge cases the seed
  // data alone doesn't cover
  "Bird Cage", "Temp Roof", "Access Scaff", "Staircase Tower", "Propping & Shoring",
  "", "Some Completely Unrecognised Value",
]

const inputPath = process.argv[2]
const values: string[] = inputPath
  ? JSON.parse(fs.readFileSync(inputPath, "utf8"))
  : DEMO_VALUES

if (!inputPath) {
  console.log("No input file given — running against the built-in demo set (prisma/seed.ts values + synthetic edge cases).")
  console.log("Pass a JSON array file of your own values to preview a real list. See the comment at the top of this script.\n")
}

let exact = 0, alias = 0, flagged = 0
console.log("Original Value".padEnd(38), "| Match".padEnd(10), "| Mapped To".padEnd(34), "| Description".padEnd(32), "| Review?")
console.log("-".repeat(140))
for (const v of values) {
  const r = classifyLegacyWorksType(v)
  if (r.matchType === "EXACT") exact++
  else if (r.matchType === "ALIAS") alias++
  else flagged++
  console.log(
    (v || "(empty)").padEnd(38), "|",
    r.matchType.padEnd(8), "|",
    r.mappedTo.padEnd(32), "|",
    (r.customDescription ?? "").slice(0, 30).padEnd(30), "|",
    r.needsReview ? `YES — ${r.reason}` : "no",
  )
}
console.log("-".repeat(140))
console.log(`${values.length} value(s): ${exact} exact, ${alias} confident alias, ${flagged} flagged for manual review.`)
