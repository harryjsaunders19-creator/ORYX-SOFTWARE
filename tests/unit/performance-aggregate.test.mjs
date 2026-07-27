import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  aggregatePerformance,
  normalizeKey,
  resolvePerformancePeriod,
} from "../../modules/performance/services/performance-service.ts"

describe("normalizeKey", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    assert.equal(normalizeKey("  Harry   Saunders "), "harry saunders")
  })
})

describe("resolvePerformancePeriod", () => {
  it("swaps inverted ranges", () => {
    assert.deepEqual(resolvePerformancePeriod("2026-07-31", "2026-07-01"), {
      from: "2026-07-01",
      to: "2026-07-31",
    })
  })
})

describe("aggregatePerformance", () => {
  const period = { from: "2026-07-01", to: "2026-07-31" }
  const users = [
    { id: "u1", name: "Harry Saunders", active: 1 },
    { id: "u2", name: "Admin", active: 1 },
    { id: "u3", name: "Disabled User", active: 0 },
  ]

  it("lists every Users-tab person even with zero jobs", () => {
    const payload = aggregatePerformance({ users, jobs: [], period, today: "2026-07-15" })
    assert.equal(payload.employees.length, 3)
    assert.deepEqual(
      payload.employees.map(e => e.name).sort(),
      ["Admin", "Disabled User", "Harry Saunders"],
    )
  })

  it("attributes issued jobs by exact designer name (case-insensitive)", () => {
    const payload = aggregatePerformance({
      users,
      jobs: [
        {
          designer: "harry saunders",
          status: "ISSUED",
          dateCompleted: "2026-07-10",
          requiredByDate: null,
        },
        {
          designer: "Admin",
          status: "IN_DESIGN",
          dateCompleted: null,
          requiredByDate: "2026-07-01",
        },
      ],
      period,
      today: "2026-07-15",
    })
    const harry = payload.employees.find(e => e.name === "Harry Saunders")
    const admin = payload.employees.find(e => e.name === "Admin")
    assert.ok(harry)
    assert.ok(admin)
    assert.equal(harry.completedInPeriod, 1)
    assert.equal(harry.completedAllTime, 1)
    assert.equal(admin.inProgress, 1)
    assert.equal(admin.overdue, 1)
    assert.equal(payload.overview.completedInPeriod, 1)
    assert.equal(payload.overview.activeDesigners, 1)
  })

  it("matches a unique first-name designer to the full user name", () => {
    const payload = aggregatePerformance({
      users,
      jobs: [
        {
          designer: "Harry",
          status: "ISSUED",
          dateCompleted: "2026-07-12",
          requiredByDate: null,
        },
      ],
      period,
      today: "2026-07-15",
    })
    const harry = payload.employees.find(e => e.name === "Harry Saunders")
    assert.equal(harry?.completedInPeriod, 1)
  })

  it("does not fuzzy-match when first names collide", () => {
    const payload = aggregatePerformance({
      users: [
        { id: "a", name: "Harry Saunders" },
        { id: "b", name: "Harry Jones" },
      ],
      jobs: [
        {
          designer: "Harry",
          status: "ISSUED",
          dateCompleted: "2026-07-12",
          requiredByDate: null,
        },
      ],
      period,
      today: "2026-07-15",
    })
    assert.equal(payload.overview.completedInPeriod, 0)
    assert.ok(payload.employees.every(e => e.completedAllTime === 0))
  })

  it("falls back to updatedAt when ISSUED has no dateCompleted", () => {
    const payload = aggregatePerformance({
      users,
      jobs: [
        {
          designer: "Harry Saunders",
          status: "ISSUED",
          dateCompleted: null,
          requiredByDate: null,
          updatedAt: "2026-07-20T14:00:00.000Z",
        },
      ],
      period,
      today: "2026-07-25",
    })
    const harry = payload.employees.find(e => e.name === "Harry Saunders")
    assert.equal(harry?.completedInPeriod, 1)
    assert.equal(harry?.lastCompletedAt, "2026-07-20")
  })

  it("skips blank user names and unassigned jobs", () => {
    const payload = aggregatePerformance({
      users: [...users, { id: "blank", name: "   " }],
      jobs: [
        {
          designer: "",
          status: "ISSUED",
          dateCompleted: "2026-07-10",
          requiredByDate: null,
        },
      ],
      period,
      today: "2026-07-15",
    })
    assert.equal(payload.employees.length, 3)
    assert.equal(payload.overview.completedInPeriod, 0)
  })
})
