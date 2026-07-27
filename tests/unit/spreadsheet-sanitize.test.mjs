import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { sanitizeSpreadsheetCell } from "../../shared/utils/spreadsheet-sanitize.ts"

describe("sanitizeSpreadsheetCell", () => {
  it("prefixes formula-like strings", () => {
    assert.equal(sanitizeSpreadsheetCell("=CMD()"), "'=CMD()")
    assert.equal(sanitizeSpreadsheetCell("+1234"), "'+1234")
    assert.equal(sanitizeSpreadsheetCell("-total"), "'-total")
    assert.equal(sanitizeSpreadsheetCell("@sum"), "'@sum")
  })

  it("leaves normal values alone", () => {
    assert.equal(sanitizeSpreadsheetCell("12 High St"), "12 High St")
    assert.equal(sanitizeSpreadsheetCell(42), 42)
    assert.equal(sanitizeSpreadsheetCell(null), null)
    assert.equal(sanitizeSpreadsheetCell(""), "")
  })
})
