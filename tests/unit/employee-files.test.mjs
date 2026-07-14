import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import path from "node:path"

const require = createRequire(import.meta.url)
const {
  resolveEmployeeFilePath,
  isEmployeeObjectKey,
  employeeObjectKey,
  safeEmployeeFilename,
} = require("../../modules/employees/services/employee-files.ts")

describe("resolveEmployeeFilePath", () => {
  const root = path.join(process.cwd(), ".data", "employee-files")

  it("resolves a valid relative path under the employee files root", () => {
    const stored = path.join(".data", "employee-files", "user-1", "photo.jpg").replace(/\\/g, "/")
    const resolved = resolveEmployeeFilePath(stored)
    assert.ok(resolved)
    assert.ok(resolved.startsWith(root))
  })

  it("rejects path traversal", () => {
    assert.equal(resolveEmployeeFilePath("../../etc/passwd"), null)
    assert.equal(resolveEmployeeFilePath(".data/employee-files/../oryx.db"), null)
  })

  it("rejects absolute paths", () => {
    assert.equal(resolveEmployeeFilePath("/etc/passwd"), null)
  })

  it("rejects empty paths", () => {
    assert.equal(resolveEmployeeFilePath(""), null)
  })

  it("does not treat storage object keys as local paths", () => {
    assert.equal(resolveEmployeeFilePath("employees/user-1/photo.jpg"), null)
  })
})

describe("employee object keys", () => {
  it("builds and detects storage keys", () => {
    const key = employeeObjectKey("user-1", "photo.jpg")
    assert.equal(key, "employees/user-1/photo.jpg")
    assert.equal(isEmployeeObjectKey(key), true)
    assert.equal(isEmployeeObjectKey(".data/employee-files/user-1/photo.jpg"), false)
  })

  it("sanitizes filenames", () => {
    assert.equal(safeEmployeeFilename("../a b.png"), ".._a_b.png")
  })
})
