import assert from "node:assert/strict"
import { describe, it } from "node:test"

/**
 * Lightweight contract checks for logical backup JSON shape.
 * Runtime import/export needs a live DB — covered by Admin UI + API.
 */

function isLogicalBackupPack(value) {
  if (!value || typeof value !== "object") return false
  return (
    value.kind === "oryx-logical-backup" &&
    typeof value.version === "number" &&
    value.tables != null &&
    typeof value.tables === "object"
  )
}

describe("logical backup pack contract", () => {
  it("accepts a valid pack", () => {
    assert.equal(
      isLogicalBackupPack({
        kind: "oryx-logical-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        source: "supabase",
        counts: { users: 0, clients: 0, jobs: 0, quotes: 0 },
        tables: { users: [], clients: [], jobs: [], quotes: [] },
      }),
      true,
    )
  })

  it("rejects Excel-shaped or empty payloads", () => {
    assert.equal(isLogicalBackupPack(null), false)
    assert.equal(isLogicalBackupPack({ version: 1 }), false)
    assert.equal(isLogicalBackupPack({ kind: "oryx-logical-backup", version: 1 }), false)
  })
})
