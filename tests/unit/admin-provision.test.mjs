import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { describe, it, afterEach } from "node:test"

describe("admin provision", () => {
  /** @type {string | null} */
  let tmpDir = null

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = null
  })

  it("provisions first admin in an isolated database", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oryx-admin-provision-"))
    const dbPath = path.join(tmpDir, "provision.db")
    process.env.DB_PATH = dbPath
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.ALLOW_BOOTSTRAP_TEST_ACCOUNTS = "false"

    const modPath = new URL("../../shared/auth/admin-provision.ts", import.meta.url).pathname
    const { provisionFirstAdmin } = await import(`${modPath}?t=${Date.now()}`)
    await import(new URL("../../lib/db/schema.ts", import.meta.url).pathname + `?t=${Date.now()}`)

    const result = await provisionFirstAdmin({
      email: "first.admin@example.com",
      password: "SecurePass1",
      name: "First Admin",
    })
    assert.equal(result.email, "first.admin@example.com")
    assert.equal(result.recovery, false)

    await assert.rejects(
      () => provisionFirstAdmin({
        email: "other@example.com",
        password: "SecurePass2",
      }),
      /already exists/i,
    )
  })

  it("CLI refuses without email env", () => {
    const root = path.join(new URL("../..", import.meta.url).pathname)
    const res = spawnSync("node", ["--import", "tsx", "scripts/admin-provision.mjs"], {
      cwd: root,
      env: { ...process.env, ADMIN_PROVISION_EMAIL: "", ADMIN_PROVISION_PASSWORD: "" },
      encoding: "utf8",
    })
    assert.notEqual(res.status, 0)
    assert.match(res.stderr + res.stdout, /ADMIN_PROVISION_EMAIL/i)
  })
})
