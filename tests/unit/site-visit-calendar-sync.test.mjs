import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  parseSiteVisitSchedule,
  siteVisitEventTitle,
} from "../../modules/jobs/services/sync-site-visit-calendar.ts"
import { validate, emptyJobForm } from "../../modules/jobs/components/job-form-constants.ts"

describe("site-visit schedule parsing", () => {
  it("parses visit date and times", () => {
    const s = parseSiteVisitSchedule({
      visitDate: "2026-08-12",
      visitStartTime: "14:00",
      visitEndTime: "15:30",
    })
    assert.deepEqual(s, {
      visitDate: "2026-08-12",
      startTime: "14:00",
      endTime: "15:30",
    })
  })

  it("defaults times and bumps end when missing or invalid", () => {
    const s = parseSiteVisitSchedule({ visitDate: "2026-08-12" })
    assert.equal(s?.startTime, "09:00")
    assert.equal(s?.endTime, "10:00")

    const badEnd = parseSiteVisitSchedule({
      visitDate: "2026-08-12",
      visitStartTime: "11:00",
      visitEndTime: "10:00",
    })
    assert.equal(badEnd?.endTime, "12:00")
  })

  it("rejects missing or invalid visit dates", () => {
    assert.equal(parseSiteVisitSchedule({}), null)
    assert.equal(parseSiteVisitSchedule({ visitDate: "12/08/2026" }), null)
  })

  it("builds a readable calendar title", () => {
    assert.equal(
      siteVisitEventTitle({
        drawingNumber: "SV-2026-001",
        clientCompany: "Acme",
        siteName: "Terminal 2",
      }),
      "Site visit — Terminal 2 (Acme)",
    )
  })
})

describe("site-visit job form validation", () => {
  it("requires location, client, and visit schedule — not type of works or requested by", () => {
    const form = {
      ...emptyJobForm(),
      itemType: "SITE_VISIT",
      siteAddress: "1 High Street",
      clientCompany: "Acme",
      requestedBy: "",
      typeOfWorks: "",
      visitDate: "2026-08-12",
      visitStartTime: "09:00",
      visitEndTime: "10:00",
    }
    assert.deepEqual(validate(form), {})
  })

  it("flags missing visit date for site visits", () => {
    const form = {
      ...emptyJobForm(),
      itemType: "SITE_VISIT",
      siteAddress: "1 High Street",
      clientCompany: "Acme",
      visitDate: "",
    }
    const errors = validate(form)
    assert.equal(errors.visitDate, "Enter the visit date")
  })

  it("still requires type of works for design jobs", () => {
    const form = {
      ...emptyJobForm(),
      itemType: "DESIGN",
      siteAddress: "1 High Street",
      clientCompany: "Acme",
      requestedBy: "Sam",
      typeOfWorks: "",
    }
    assert.equal(validate(form).typeOfWorks, "Select a type of works")
  })
})
