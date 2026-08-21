import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { paginateScopedJobsList } from "../../modules/jobs/lib/jobs-list-scoped.ts"
import { flagRevisions } from "../../modules/jobs/lib/jobs-list-overlay.ts"
import { matchesJobsListScope } from "../../modules/jobs/lib/current-work.ts"

const __dirname = dirname(fileURLToPath(import.meta.url))
const listApiSrc = readFileSync(join(__dirname, "../../modules/jobs/api/list.ts"), "utf8")
const migrationSrc = readFileSync(
  join(__dirname, "../../supabase/migrations/046_jobs_list_scoped_page.sql"),
  "utf8",
)

function parent(partial) {
  return {
    parentJobId: null,
    designer: "Alex",
    requiredByDate: "2026-08-20",
    listSortKey: partial.listSortKey ?? partial.id,
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
    status: "IN_DESIGN",
    ...partial,
  }
}

function rev(partial) {
  return {
    designer: "Alex",
    requiredByDate: "2026-08-25",
    updatedAt: "2026-02-01T00:00:00.000Z",
    status: "IN_DESIGN",
    ...partial,
  }
}

describe("jobs list scoped pagination (current-work semantics)", () => {
  it("Case A: active parent, no revisions → original / active", () => {
    const result = paginateScopedJobsList({
      parents: [parent({ id: "p1", status: "IN_DESIGN" })],
      revisions: [],
      scope: "active",
      page: 1,
      pageSize: 25,
    })
    assert.deepEqual(result.ids, ["p1"])
    assert.equal(result.scopeCounts.active, 1)
    assert.equal(result.scopeCounts.revisions, 0)
    assert.equal(result.scopeCounts.completed, 0)
  })

  it("Case B: parent completed, latest revision active → revisions scope", () => {
    const result = paginateScopedJobsList({
      parents: [parent({ id: "p1", status: "ISSUED" })],
      revisions: [rev({ id: "r1", parentJobId: "p1", revisionLetter: "A", status: "CHECKING" })],
      scope: "revisions",
      page: 1,
      pageSize: 25,
    })
    assert.deepEqual(result.ids, ["p1"])
    assert.equal(result.scopeCounts.revisions, 1)
    assert.equal(result.scopeCounts.completed, 0)
    assert.equal(result.scopeCounts.active, 1)
  })

  it("Case C: parent active, latest revision completed → original (active rev none)", () => {
    const enriched = flagRevisions(
      [parent({ id: "p1", status: "IN_DESIGN" })],
      [rev({ id: "r1", parentJobId: "p1", revisionLetter: "A", status: "ISSUED" })],
    )
    assert.equal(enriched[0].currentWorkType, "original")
    assert.equal(enriched[0].currentStatus, "IN_DESIGN")
  })

  it("Case D: older revision active but latest completed → none (latest letter wins)", () => {
    const enriched = flagRevisions(
      [parent({ id: "p1", status: "ISSUED" })],
      [
        rev({ id: "rA", parentJobId: "p1", revisionLetter: "A", status: "IN_DESIGN", updatedAt: "2026-03-01T00:00:00.000Z" }),
        rev({ id: "rB", parentJobId: "p1", revisionLetter: "B", status: "ISSUED", updatedAt: "2026-04-01T00:00:00.000Z" }),
      ],
    )
    // Active revs = only A; B is ISSUED. Latest active by letter = A.
    assert.equal(enriched[0].currentWorkType, "revision")
    assert.equal(enriched[0].currentRevisionLetter, "A")
  })

  it("Case D variant: multiple active — highest letter wins", () => {
    const enriched = flagRevisions(
      [parent({ id: "p1", status: "ISSUED" })],
      [
        rev({ id: "rA", parentJobId: "p1", revisionLetter: "A", status: "IN_DESIGN" }),
        rev({ id: "rC", parentJobId: "p1", revisionLetter: "C", status: "CHECKING" }),
        rev({ id: "rB", parentJobId: "p1", revisionLetter: "B", status: "NEW_REQUEST" }),
      ],
    )
    assert.equal(enriched[0].currentRevisionLetter, "C")
    assert.equal(enriched[0].currentStatus, "CHECKING")
  })

  it("Case E/F: archived parents excluded by callers; completed parent alone → completed", () => {
    const result = paginateScopedJobsList({
      parents: [parent({ id: "p1", status: "ISSUED" })],
      revisions: [rev({ id: "r1", parentJobId: "p1", revisionLetter: "A", status: "ISSUED" })],
      scope: "completed",
      page: 1,
      pageSize: 25,
    })
    assert.deepEqual(result.ids, ["p1"])
    assert.equal(result.scopeCounts.completed, 1)
    assert.equal(result.scopeCounts.active, 0)
  })

  it("Case G: designer comes from latest active revision (null falls back to parent)", () => {
    const enriched = flagRevisions(
      [parent({ id: "p1", status: "ISSUED", designer: "ParentDes" })],
      [rev({
        id: "r1",
        parentJobId: "p1",
        revisionLetter: "A",
        status: "IN_DESIGN",
        designer: null,
      })],
    )
    assert.equal(enriched[0].currentDesigner, "ParentDes")
  })

  it("Case G2: empty-string revision designer is kept (?? not ||)", () => {
    const enriched = flagRevisions(
      [parent({ id: "p1", status: "ISSUED", designer: "ParentDes" })],
      [rev({
        id: "r1",
        parentJobId: "p1",
        revisionLetter: "A",
        status: "IN_DESIGN",
        designer: "",
      })],
    )
    assert.equal(enriched[0].currentDesigner, "")
  })

  it("Case H: deadline from revision with parent fallback", () => {
    const enriched = flagRevisions(
      [parent({ id: "p1", status: "ISSUED", requiredByDate: "2026-01-01" })],
      [rev({
        id: "r1",
        parentJobId: "p1",
        revisionLetter: "A",
        status: "IN_DESIGN",
        requiredByDate: "2026-09-01",
      })],
    )
    assert.equal(enriched[0].currentRequiredByDate, "2026-09-01")
  })

  it("Case I: billable flag does not affect current-work type", () => {
    const enriched = flagRevisions(
      [parent({ id: "p1", status: "ISSUED" })],
      [rev({ id: "r1", parentJobId: "p1", revisionLetter: "A", status: "IN_DESIGN", billable: false })],
    )
    assert.equal(enriched[0].currentWorkType, "revision")
  })

  it("Case J: null optional revision fields fall back to parent", () => {
    const enriched = flagRevisions(
      [parent({
        id: "p1",
        status: "ISSUED",
        designer: "P",
        requiredByDate: "2026-07-01",
        quoteValue: 100,
      })],
      [rev({
        id: "r1",
        parentJobId: "p1",
        revisionLetter: "A",
        status: "CHECKING",
        designer: null,
        requiredByDate: null,
        quoteValue: null,
      })],
    )
    assert.equal(enriched[0].currentDesigner, "P")
    assert.equal(enriched[0].currentRequiredByDate, "2026-07-01")
    assert.equal(enriched[0].currentQuoteValue, 100)
  })

  it("filters status/unassigned/deadline on current display fields", () => {
    const parents = [
      parent({ id: "p-open", status: "ISSUED", listSortKey: "0001" }),
      parent({ id: "p-done", status: "ISSUED", listSortKey: "0002" }),
      parent({ id: "p-unassigned", status: "IN_DESIGN", designer: "", listSortKey: "0003" }),
    ]
    const revisions = [
      rev({
        id: "r1",
        parentJobId: "p-open",
        revisionLetter: "A",
        status: "CHECKING",
        designer: "Sam",
        requiredByDate: "2026-08-10",
      }),
    ]
    const byStatus = paginateScopedJobsList({
      parents,
      revisions,
      scope: "all",
      page: 1,
      pageSize: 25,
      status: "CHECKING",
    })
    assert.deepEqual(byStatus.ids, ["p-open"])

    const unassigned = paginateScopedJobsList({
      parents,
      revisions,
      scope: "all",
      page: 1,
      pageSize: 25,
      unassigned: true,
    })
    assert.deepEqual(unassigned.ids, ["p-unassigned"])

    const overdue = paginateScopedJobsList({
      parents,
      revisions,
      scope: "all",
      page: 1,
      pageSize: 25,
      overdue: true,
      today: "2026-08-20",
      weekStart: "2026-08-17",
      weekEnd: "2026-08-23",
    })
    assert.deepEqual(overdue.ids, ["p-open"])
  })

  it("paginates after scope filter and keeps stable scopeCounts", () => {
    const parents = []
    const revisions = []
    for (let i = 0; i < 10; i++) {
      const id = `p${String(i).padStart(2, "0")}`
      parents.push(parent({
        id,
        status: i < 4 ? "ISSUED" : "IN_DESIGN",
        listSortKey: String(i).padStart(4, "0"),
      }))
      if (i < 3) {
        revisions.push(rev({
          id: `r${i}`,
          parentJobId: id,
          revisionLetter: "A",
          status: "IN_DESIGN",
        }))
      }
    }
    const page1 = paginateScopedJobsList({
      parents,
      revisions,
      scope: "active",
      page: 1,
      pageSize: 3,
    })
    const page2 = paginateScopedJobsList({
      parents,
      revisions,
      scope: "active",
      page: 2,
      pageSize: 3,
    })
    // 3 revision + 6 original active = 9 active
    assert.equal(page1.total, 9)
    assert.equal(page1.ids.length, 3)
    assert.equal(page2.ids.length, 3)
    assert.notDeepEqual(page1.ids, page2.ids)
    assert.deepEqual(page1.scopeCounts, page2.scopeCounts)
    assert.equal(page1.scopeCounts.all, 10)
    assert.equal(page1.scopeCounts.revisions, 3)
    assert.equal(page1.scopeCounts.completed, 1)
    assert.equal(page1.scopeCounts.active, 9)
  })

  it("scales past the legacy 5000-row overlay without capping", () => {
    const parents = []
    for (let i = 0; i < 5200; i++) {
      parents.push(parent({
        id: `big-${i}`,
        status: i % 2 === 0 ? "IN_DESIGN" : "ISSUED",
        listSortKey: String(i).padStart(6, "0"),
      }))
    }
    const page = paginateScopedJobsList({
      parents,
      revisions: [],
      scope: "active",
      page: 105,
      pageSize: 25,
    })
    assert.equal(page.total, 2600)
    assert.equal(page.ids.length, 0)
    // page 104 = indices 2575..2599 of the 2600 active (even ids)
    const last = paginateScopedJobsList({
      parents,
      revisions: [],
      scope: "active",
      page: 104,
      pageSize: 25,
    })
    assert.equal(last.ids.length, 25)
    assert.equal(last.ids[0], "big-5150")
    assert.equal(last.ids[24], "big-5198")
  })

  it("every scope tab classification matches matchesJobsListScope", () => {
    const types = ["original", "revision", "none"]
    for (const type of types) {
      for (const scope of ["all", "active", "revisions", "completed"]) {
        assert.equal(
          matchesJobsListScope(type, scope),
          scope === "all"
            || (scope === "active" && type !== "none")
            || (scope === "revisions" && type === "revision")
            || (scope === "completed" && type === "none"),
        )
      }
    }
  })
})

describe("jobs list preferred path has no 5000 cap", () => {
  it("list API prefers findScopedListPage before MAX_JOB_LIST_EXPORT_ROWS overlay", () => {
    assert.match(listApiSrc, /findScopedListPage/)
    assert.match(listApiSrc, /jobs\.list\.scoped_rpc_fallback/)
    const rpcIdx = listApiSrc.indexOf("findScopedListPage")
    const fallbackIdx = listApiSrc.indexOf("Compatibility fallback")
    assert.ok(rpcIdx > 0 && fallbackIdx > rpcIdx)
  })

  it("migration 046 defines jobs_list_scoped_page without app-layer caps", () => {
    assert.match(migrationSrc, /jobs_list_scoped_page/)
    assert.match(migrationSrc, /security definer/)
    assert.match(migrationSrc, /grant execute[\s\S]*service_role/)
    assert.match(migrationSrc, /idx_jobs_revisions_active_current_work/)
  })
})
