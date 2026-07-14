/**
 * Employee file storage — local disk in SQLite-only dev; Supabase Storage when
 * admin credentials are configured (including all Vercel deploys).
 *
 * Stored paths:
 * - Object store: `employees/{userId}/{filename}`
 * - Legacy local: `.data/employee-files/{userId}/{filename}`
 */
import fs from "fs"
import path from "path"
import { createAdminClient } from "@/lib/supabase/admin"
import { isSupabaseAdminConfigured } from "@/lib/supabase/config"

export const EMPLOYEE_FILES_BUCKET = "employee-files"
/** Prefix stored in DB for objects in EMPLOYEE_FILES_BUCKET. */
export const EMPLOYEE_OBJECT_PREFIX = "employees/"

const EMPLOYEE_FILES_DIR = process.env.EMPLOYEE_FILES_DIR
  ?? (process.env.VERCEL ? path.join("/tmp", "employee-files") : path.join(process.cwd(), ".data", "employee-files"))

export function useEmployeeObjectStorage(): boolean {
  return isSupabaseAdminConfigured()
}

export function employeeFilesRoot(): string {
  fs.mkdirSync(EMPLOYEE_FILES_DIR, { recursive: true })
  return EMPLOYEE_FILES_DIR
}

export function employeeUserDir(userId: string): string {
  assertValidUserId(userId)
  const dir = path.join(employeeFilesRoot(), userId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function safeEmployeeFilename(original: string): string {
  return original.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120)
}

export const PHOTO_MIME = new Set(["image/png", "image/jpeg", "image/webp"])
export const DOC_MIME = new Set([
  ...PHOTO_MIME,
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
])

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const MAX_DOC_BYTES = 15 * 1024 * 1024

function assertValidUserId(userId: string): void {
  if (!/^[\w-]+$/.test(userId)) {
    throw new Error("Invalid employee user id")
  }
}

export function isEmployeeObjectKey(storedPath: string): boolean {
  return storedPath.startsWith(EMPLOYEE_OBJECT_PREFIX)
}

/** Build the durable storage key written to profile/document rows. */
export function employeeObjectKey(userId: string, filename: string): string {
  assertValidUserId(userId)
  return `${EMPLOYEE_OBJECT_PREFIX}${userId}/${safeEmployeeFilename(filename)}`
}

/** Resolve a DB-stored relative path to an absolute path under the employee files root. */
export function resolveEmployeeFilePath(storedPath: string): string | null {
  if (!storedPath || path.isAbsolute(storedPath) || isEmployeeObjectKey(storedPath)) return null
  const normalized = storedPath.replace(/\\/g, "/").replace(/^\/+/, "")
  if (normalized.includes("..")) return null

  const root = path.resolve(employeeFilesRoot())
  const absolute = path.resolve(process.cwd(), normalized)
  if (!absolute.startsWith(root + path.sep) && absolute !== root) return null
  return absolute
}

function objectPathFromKey(storedPath: string): string {
  // Bucket-relative path: strip the "employees/" DB prefix.
  return storedPath.slice(EMPLOYEE_OBJECT_PREFIX.length)
}

/** Persist bytes and return the path value to store in the DB. */
export async function writeEmployeeFile(params: {
  userId: string
  filename: string
  data: Buffer
  contentType: string
}): Promise<string> {
  const filename = safeEmployeeFilename(params.filename)
  if (useEmployeeObjectStorage()) {
    const key = employeeObjectKey(params.userId, filename)
    const { error } = await createAdminClient().storage
      .from(EMPLOYEE_FILES_BUCKET)
      .upload(objectPathFromKey(key), params.data, {
        contentType: params.contentType,
        upsert: true,
      })
    if (error) throw error
    return key
  }

  const dir = employeeUserDir(params.userId)
  const fullPath = path.join(dir, filename)
  fs.writeFileSync(fullPath, params.data)
  return path.join(".data", "employee-files", params.userId, filename).replace(/\\/g, "/")
}

/** Load file bytes from object storage or local disk. */
export async function readEmployeeFile(storedPath: string): Promise<Buffer | null> {
  if (!storedPath) return null
  if (isEmployeeObjectKey(storedPath)) {
    if (!useEmployeeObjectStorage()) return null
    const { data, error } = await createAdminClient().storage
      .from(EMPLOYEE_FILES_BUCKET)
      .download(objectPathFromKey(storedPath))
    if (error || !data) return null
    return Buffer.from(await data.arrayBuffer())
  }

  const fullPath = resolveEmployeeFilePath(storedPath)
  if (!fullPath || !fs.existsSync(fullPath)) return null
  return fs.readFileSync(fullPath)
}

/** Best-effort delete of a stored file (object or local). */
export async function deleteEmployeeFile(storedPath: string | null | undefined): Promise<void> {
  if (!storedPath) return
  if (isEmployeeObjectKey(storedPath)) {
    if (!useEmployeeObjectStorage()) return
    await createAdminClient().storage
      .from(EMPLOYEE_FILES_BUCKET)
      .remove([objectPathFromKey(storedPath)])
    return
  }
  const fullPath = resolveEmployeeFilePath(storedPath)
  if (fullPath && fs.existsSync(fullPath)) {
    try { fs.unlinkSync(fullPath) } catch { /* ignore */ }
  }
}
