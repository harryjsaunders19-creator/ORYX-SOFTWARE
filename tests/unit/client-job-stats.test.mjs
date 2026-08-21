import { describe, it } from "node:test"
import assert from "node:assert/strict"

/**
 * Pure aggregation mirroring clientJobStatsForHolds / job_stats_for_clients RPC.
 * Kept here so we can assert semantics without a live Supabase connection.
 */
function aggregateClientJobStats(rows) {
  const map = new Map()
  for (const row of rows) {
    const clientId = row.client_id
    if (!clientId) continue
    const entry = map.get(clientId) ?? { activeJobCount: 0, quoteValueTotal: 0 }
    if (row.status !== "ISSUED") entry.activeJobCount += 1
    const qv = row.quote_value != null ? Number(row.quote_value) : 0
    if (qv > 0) entry.quoteValueTotal += qv
    map.set(clientId, entry)
  }
  return map
}

describe("client job stats for holds (aggregation semantics)", () => {
  it("returns empty map for no rows", () => {
    assert.equal(aggregateClientJobStats([]).size, 0)
  })

  it("counts non-ISSUED as active and ignores ISSUED for active count", () => {
    const map = aggregateClientJobStats([
      { client_id: "c1", status: "IN_DESIGN", quote_value: 100 },
      { client_id: "c1", status: "ISSUED", quote_value: 200 },
      { client_id: "c1", status: "CHECKING", quote_value: null },
    ])
    const s = map.get("c1")
    assert.equal(s.activeJobCount, 2)
    assert.equal(s.quoteValueTotal, 300)
  })

  it("skips null and non-positive quote values", () => {
    const map = aggregateClientJobStats([
      { client_id: "c1", status: "NEW_REQUEST", quote_value: null },
      { client_id: "c1", status: "NEW_REQUEST", quote_value: 0 },
      { client_id: "c1", status: "NEW_REQUEST", quote_value: -5 },
      { client_id: "c1", status: "NEW_REQUEST", quote_value: 50 },
    ])
    assert.equal(map.get("c1").quoteValueTotal, 50)
    assert.equal(map.get("c1").activeJobCount, 4)
  })

  it("includes revisions toward the same client totals", () => {
    const map = aggregateClientJobStats([
      { client_id: "c1", status: "ISSUED", quote_value: 1000 },
      { client_id: "c1", status: "IN_DESIGN", quote_value: 250 },
    ])
    assert.equal(map.get("c1").activeJobCount, 1)
    assert.equal(map.get("c1").quoteValueTotal, 1250)
  })

  it("remains correct for >1000 rows (PostgREST page-size regression guard)", () => {
    const rows = []
    for (let i = 0; i < 1500; i++) {
      rows.push({
        client_id: "c-big",
        status: i % 5 === 0 ? "ISSUED" : "IN_DESIGN",
        quote_value: i % 5 === 0 ? 10 : 1,
      })
    }
    const map = aggregateClientJobStats(rows)
    const s = map.get("c-big")
    // 1500/5 = 300 issued → 1200 active
    assert.equal(s.activeJobCount, 1200)
    // issued: 300 * 10 = 3000; active: 1200 * 1 = 1200 → total 4200
    assert.equal(s.quoteValueTotal, 4200)
  })

  it("groups multiple clients independently", () => {
    const map = aggregateClientJobStats([
      { client_id: "a", status: "IN_DESIGN", quote_value: 10 },
      { client_id: "b", status: "ISSUED", quote_value: 99 },
      { client_id: "a", status: "ISSUED", quote_value: 5 },
    ])
    assert.equal(map.get("a").activeJobCount, 1)
    assert.equal(map.get("a").quoteValueTotal, 15)
    assert.equal(map.get("b").activeJobCount, 0)
    assert.equal(map.get("b").quoteValueTotal, 99)
  })
})
