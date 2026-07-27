import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { importLogicalBackupPack } from "../../modules/backups/services/logical-import.ts"

describe("logical backup import guards", () => {
  it("rejects non-logical JSON payloads", async () => {
    await assert.rejects(
      importLogicalBackupPack({ foo: "bar" }),
      /Invalid backup file/i,
    )
  })

  it("rejects future backup versions", async () => {
    await assert.rejects(
      importLogicalBackupPack({
        kind: "oryx-logical-backup",
        version: 999,
        tables: { users: [], clients: [], jobs: [], quotes: [] },
      }),
      /newer than the app supports/i,
    )
  })
})
