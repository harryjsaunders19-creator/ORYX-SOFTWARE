import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  getCalendarRange,
  resolveEventDisplayColour,
  isEventOverdue,
  eventTypeLabel,
} from "../../modules/calendar/lib/calendar-display.ts"
import {
  resolveCategoryColour,
  CATEGORY_COLOUR_DEFAULTS,
  resolveCategoryFilter,
} from "../../modules/calendar/config/category-config.ts"
import {
  isJobDerivedEventId,
  jobIdFromDerivedEventId,
} from "../../modules/calendar/lib/job-derived-ids.ts"

describe("calendar-display", () => {
  it("builds month range spanning week-aligned grid", () => {
    const { from, to } = getCalendarRange(new Date(2026, 7, 5), "month") // Aug 2026
    assert.equal(from <= "2026-08-01", true)
    assert.equal(to >= "2026-08-31", true)
  })

  it("builds week range Monday–Sunday", () => {
    const { from, to } = getCalendarRange(new Date(2026, 7, 5), "week") // Wed
    assert.equal(from, "2026-08-03")
    assert.equal(to, "2026-08-09")
  })

  it("builds agenda range ~8 weeks ahead", () => {
    const { from, to } = getCalendarRange(new Date(2026, 7, 5), "agenda")
    assert.equal(from, "2026-08-05")
    assert.equal(to, "2026-09-30")
  })

  it("uses muted category colours", () => {
    assert.equal(resolveCategoryColour("cat_site_visit"), CATEGORY_COLOUR_DEFAULTS.cat_site_visit.color)
    assert.equal(resolveCategoryColour("cat_deadline"), CATEGORY_COLOUR_DEFAULTS.cat_deadline.color)
    assert.match(CATEGORY_COLOUR_DEFAULTS.cat_overdue.color, /^#/)
  })

  it("tints overdue events muted red", () => {
    const colour = resolveEventDisplayColour({
      categoryId: "cat_deadline",
      endDate: "2020-01-01",
      status: "SCHEDULED",
    })
    assert.equal(colour, CATEGORY_COLOUR_DEFAULTS.cat_overdue.color)
    assert.equal(
      isEventOverdue({ endDate: "2020-01-01", status: "SCHEDULED" }),
      true,
    )
    assert.equal(
      isEventOverdue({ endDate: "2099-01-01", status: "SCHEDULED" }),
      false,
    )
  })

  it("keeps colour as non-sole indicator via type labels", () => {
    assert.equal(eventTypeLabel("cat_site_visit"), "Site Visit")
    assert.equal(eventTypeLabel("cat_deadline", "Design Deadline"), "Design Deadline")
  })
})

describe("calendar category filters", () => {
  it("groups meeting categories", () => {
    const f = resolveCategoryFilter("cat_client_meeting")
    assert.ok(f.categoryIds?.includes("cat_teams_meeting"))
    assert.ok(f.categoryIds?.includes("cat_internal_meeting"))
  })

  it("groups deadline-derived categories", () => {
    const f = resolveCategoryFilter("cat_deadline")
    assert.deepEqual(f.categoryIds, [
      "cat_deadline",
      "cat_revision_due",
      "cat_checking_due",
    ])
  })
})

describe("job-derived event ids", () => {
  it("parses derived job ids for deep links", () => {
    const id = "derived:job:deadline:abc123"
    assert.equal(isJobDerivedEventId(id), true)
    assert.equal(jobIdFromDerivedEventId(id), "abc123")
    assert.equal(isJobDerivedEventId("evt_manual"), false)
    assert.equal(jobIdFromDerivedEventId("evt_manual"), null)
  })
})
