import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  breakTokenToWidth,
  firstLineBaselineY,
  measureTableRowHeight,
  wrapTextToWidth,
  capH,
  dscH,
} from "../../modules/quotes/pdf/table-layout.ts"

const FONT = 10
const STEP = Math.round(FONT * 1.52) // matches generate.ts STEP_BODY
const MIN_H = 22
const PAD = 6

describe("quotation PDF table layout", () => {
  it("keeps one-line rows at the template minimum height", () => {
    const h = measureTableRowHeight({
      lineCount: 1,
      fontSize: FONT,
      lineStep: STEP,
      minRowHeight: MIN_H,
      cellPadY: PAD,
    })
    assert.equal(h, MIN_H)
  })

  it("expands row height with wrapped description lines", () => {
    const one = measureTableRowHeight({
      lineCount: 1,
      fontSize: FONT,
      lineStep: STEP,
      minRowHeight: MIN_H,
      cellPadY: PAD,
    })
    const many = measureTableRowHeight({
      lineCount: 8,
      fontSize: FONT,
      lineStep: STEP,
      minRowHeight: MIN_H,
      cellPadY: PAD,
    })
    assert.ok(many > one)
    const expected =
      PAD * 2 + capH(FONT) + 7 * STEP + dscH(FONT)
    assert.equal(many, expected)
  })

  it("centres short rows and top-aligns tall rows on the first line", () => {
    const rowTop = 500
    const shortH = MIN_H
    const shortBase = firstLineBaselineY(rowTop, shortH, {
      lineCount: 1,
      fontSize: FONT,
      cellPadY: PAD,
    })
    assert.equal(shortBase, rowTop - Math.round((shortH - capH(FONT)) / 2))

    const tallH = measureTableRowHeight({
      lineCount: 6,
      fontSize: FONT,
      lineStep: STEP,
      minRowHeight: MIN_H,
      cellPadY: PAD,
    })
    const tallBase = firstLineBaselineY(rowTop, tallH, {
      lineCount: 6,
      fontSize: FONT,
      cellPadY: PAD,
    })
    // Glyph top sits cellPadY below row top — never into the header band
    assert.equal(tallBase, rowTop - PAD - capH(FONT))
    assert.ok(tallBase < rowTop - PAD)
  })

  it("stacks rows without overlap using cumulative heights", () => {
    const heights = [1, 3, 8, 2].map(lineCount =>
      measureTableRowHeight({
        lineCount,
        fontSize: FONT,
        lineStep: STEP,
        minRowHeight: MIN_H,
        cellPadY: PAD,
      }),
    )
    let y = 700
    const bottoms = []
    for (const h of heights) {
      const bottom = y - h
      bottoms.push(bottom)
      y = bottom
    }
    // Each subsequent row starts exactly where the previous ended
    assert.equal(bottoms[0], 700 - heights[0])
    assert.equal(bottoms[1], bottoms[0] - heights[1])
    assert.equal(bottoms[2], bottoms[1] - heights[2])
    assert.equal(bottoms[3], bottoms[2] - heights[3])
  })

  it("wraps words and breaks overlong tokens without clipping", () => {
    const measure = (s) => s.length * 5 // 5pt per char mock
    const lines = wrapTextToWidth(
      "Site visit labour\nReturn travel mileage detail",
      measure,
      40, // 8 chars
    )
    assert.ok(lines.length >= 3)
    for (const line of lines) {
      if (line) assert.ok(measure(line) <= 40)
    }

    const broken = breakTokenToWidth("ABCDEFGHIJKLMNOP", measure, 20)
    assert.deepEqual(broken, ["ABCD", "EFGH", "IJKL", "MNOP"])
    for (const part of broken) assert.ok(measure(part) <= 20)
  })

  it("preserves blank lines from supporting detail newlines", () => {
    const measure = (s) => s.length
    const lines = wrapTextToWidth("Line one\n\nLine three", measure, 100)
    assert.deepEqual(lines, ["Line one", "", "Line three"])
  })
})
