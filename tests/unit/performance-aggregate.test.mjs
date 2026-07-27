import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  aggregatePerformance,
  normalizeKey,
  normalizeRole,
  resolvePerformancePeriod,
} from "../../modules/performance/services/performance-service.ts"

describe("normalizeKey", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    assert.equal(normalizeKey("  Harry   Saunders "), "harry saunders")
  })
})

describe("normalizeRole", () => {
  it("treats only ADMIN as admin (case-insensitive)", () => {
    assert.equal(normalizeRole("ADMIN"), "ADMIN")
    assert.equal(normalizeRole("admin"), "ADMIN")
    assert.equal(normalizeRole("ENGINEER"), "ENGINEER")
    assert.equal(normalizeRole(null), "ENGINEER")
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
    {
      id: "u1",
      name: "Harry Saunders",
      role: "ADMIN",
      email: "harry@oryxdesignltd.co.uk",
      emailLower: "harry@oryxdesignltd.co.uk",
      active: 1,
    },
    { id: "u2", name: "Priya Shah", role: "ENGINEER", email: "priya@oryxdesignltd.co.uk", active: 1 },
    { id: "u3", name: "Disabled User", role: "ENGINEER", active: 0 },
  ]

  it("lists every Users-tab person including Admins", () => {
    const payload = aggregatePerformance({ users, jobs: [], period, today: "2026-07-15" })
    assert.equal(payload.overview.totalUsers, 3)
    assert.equal(payload.overview.adminUsers, 1)
    assert.equal(payload.overview.engineerUsers, 2)
    const harry = payload.employees.find(e => e.name === "Harry Saunders")
    assert.equal(harry?.role, "ADMIN")
    assert.equal(harry?.fromDirectory, true)
  })

  it("attributes issued jobs to Admin designers the same as Engineers", () => {
    const payload = aggregatePerformance({
      users,
      jobs: [
        {
          designer: "Harry Saunders",
          status: "ISSUED",
          dateCompleted: "2026-07-10",
          requiredByDate: null,
        },
        {
          designer: "Priya Shah",
          status: "ISSUED",
          dateCompleted: "2026-07-11",
          requiredByDate: null,
        },
        {
          designer: "Harry Saunders",
          status: "IN_DESIGN",
          dateCompleted: null,
          requiredByDate: "2026-07-01",
        },
      ],
      period,
      today: "2026-07-15",
    })
    const harry = payload.employees.find(e => e.name === "Harry Saunders")
    const priya = payload.employees.find(e => e.name === "Priya Shah")
    assert.ok(harry)
    assert.ok(priya)
    assert.equal(harry.role, "ADMIN")
    assert.equal(harry.completedInPeriod, 1)
    assert.equal(harry.inProgress, 1)
    assert.equal(priya.completedInPeriod, 1)
    assert.equal(payload.overview.completedInPeriod, 2)
  })

  it("maps designer 'Harry' onto Admin 'Harry Saunders' by first name", () => {
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
    assert.equal(harry?.role, "ADMIN")
    // Should not also create a synthetic "Harry" row when first-name matched.
    assert.equal(payload.employees.some(e => e.name === "Harry"), false)
  })

  it("maps designer 'harry' onto Admin via email local-part", () => {
    const payload = aggregatePerformance({
      users: [
        {
          id: "u1",
          name: "Harry Saunders",
          role: "ADMIN",
          email: "harry@oryxdesignltd.co.uk",
        },
        // Another Harry makes first-name matching ambiguous — email must win.
        { id: "u2", name: "Harry Jones", role: "ENGINEER", email: "hjones@oryxdesignltd.co.uk" },
      ],
      jobs: [
        {
          designer: "harry",
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
    assert.equal(payload.employees.find(e => e.name === "Harry Jones")?.completedInPeriod, 0)
  })

  it("keeps unmatched free-text designers visible on the board", () => {
    const payload = aggregatePerformance({
      users,
      jobs: [
        {
          designer: "Legacy Freelancer",
          status: "ISSUED",
          dateCompleted: "2026-07-08",
          requiredByDate: null,
        },
      ],
      period,
      today: "2026-07-15",
    })
    const legacy = payload.employees.find(e => e.name === "Legacy Freelancer")
    assert.ok(legacy)
    assert.equal(legacy.fromDirectory, false)
    assert.equal(legacy.completedInPeriod, 1)
    assert.equal(payload.overview.totalUsers, 3)
  })

  it("never drops Admins when Engineers are also present", () => {
    const payload = aggregatePerformance({
      users: [
        { id: "a", name: "Admin One", role: "ADMIN" },
        { id: "b", name: "Admin Two", role: "ADMIN" },
        { id: "c", name: "Engineer One", role: "ENGINEER" },
      ],
      jobs: [],
      period,
      today: "2026-07-15",
    })
    assert.equal(payload.overview.adminUsers, 2)
    assert.equal(payload.overview.engineerUsers, 1)
    assert.equal(payload.employees.length, 3)
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
      users: [...users, { id: "blank", name: "   ", role: "ADMIN" }],
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
    assert.equal(payload.overview.totalUsers, 3)
    assert.equal(payload.overview.completedInPeriod, 0)
  })
})
