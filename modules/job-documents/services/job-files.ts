/**
 * Job file storage — Supabase Storage when admin credentials exist;
 * local disk fallback for SQLite-only local development.
 *
 * DB path prefix: `jobs/{rootJobId}/{scope}/{docId}/{filename}`
 */
import fs from "fs"
import path from "path"
import { createAdminClient } from "@/lib/supabase/admin"
import { isSupabaseAdminConfigured } from "@/lib/supabase/config"
import { storageScope } from "../constants"

export const JOB_FILES_BUCKET = "job-files"
export const JOB_OBJECT_PREFIX = "jobs/"

const JOB_FILES_DIR = process.env.JOB_FILES_DIR
  ?? (process.env.VERCEL ? path.join("/tmp", "job-files") : path.join(process.cwd(), ".data", "job-files"))

export function isJobObjectStorageEnabled(): boolean {
  return isSupabaseAdminConfigured()
}

export function safeJobFilename(original: string): string {
  return original.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file"
}

function assertId(id: string, label: string): void {
  if (!/^[\w-]+$/.test(id)) throw new Error(`Invalid ${label}`)
}

export function jobObjectKey(params: {
  rootJobId: string
  docId: string
  filename: string
  revisionLetter?: string | null
}): string {
  assertId(params.rootJobId, "root job id")
  assertId(params.docId, "document id")
  const scope = storageScope(params.revisionLetter)
  const filename = safeJobFilename(params.filename)
  return `${JOB_OBJECT_PREFIX}${params.rootJobId}/${scope}/${params.docId}/${filename}`
}

function objectPathFromKey(storedPath: string): string {
  return storedPath.startsWith(JOB_OBJECT_PREFIX)
    ? storedPath.slice(JOB_OBJECT_PREFIX.length)
    : storedPath
}

function jobFilesRoot(): string {
  fs.mkdirSync(JOB_FILES_DIR, { recursive: true })
  return JOB_FILES_DIR
}

export async function writeJobFile(params: {
  rootJobId: string
  docId: string
  filename: string
  revisionLetter?: string | null
  data: Buffer
  contentType: string
}): Promise<string> {
  const key = jobObjectKey(params)
  // Prefer a clean MIME; fall back to octet-stream if Storage rejects the type
  // (Windows often sends `message/rfc822; charset=…` which fails allow-lists).
  const primaryType = (params.contentType || "application/octet-stream").split(";")[0]!.trim()
    || "application/octet-stream"
  const candidates = primaryType === "application/octet-stream"
    ? [primaryType]
    : [primaryType, "application/octet-stream"]

  if (isJobObjectStorageEnabled()) {
    const client = createAdminClient()
    let lastError: unknown = null
    for (const contentType of candidates) {
      const { error } = await client.storage
        .from(JOB_FILES_BUCKET)
        .upload(objectPathFromKey(key), params.data, {
          contentType,
          upsert: true,
        })
      if (!error) return key
      lastError = error
      const msg = error.message?.toLowerCase() ?? ""
      // Only retry with octet-stream for MIME allow-list failures
      if (!/mime|content.?type|not (supported|allowed)/i.test(msg)) break
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(
        lastError && typeof lastError === "object" && "message" in lastError
          ? String((lastError as { message: unknown }).message)
          : "Storage upload failed",
      )
  }

  // Vercel /tmp is wiped on cold start — never silently fall back to local disk.
  if (process.env.VERCEL === "1") {
    throw new Error(
      "Job file storage requires Supabase Storage on Vercel (bucket `job-files`). " +
      "Refusing ephemeral /tmp write — configure SUPABASE_SERVICE_ROLE_KEY and run migration 037.",
    )
  }

  const relative = objectPathFromKey(key)
  const fullPath = path.join(jobFilesRoot(), relative)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, params.data)
  return key
}

export async function readJobFile(storedPath: string): Promise<Buffer | null> {
  if (!storedPath) return null
  if (isJobObjectStorageEnabled() && storedPath.startsWith(JOB_OBJECT_PREFIX)) {
    const { data, error } = await createAdminClient().storage
      .from(JOB_FILES_BUCKET)
      .download(objectPathFromKey(storedPath))
    if (error || !data) return null
    return Buffer.from(await data.arrayBuffer())
  }

  const relative = objectPathFromKey(storedPath)
  if (relative.includes("..")) return null
  const fullPath = path.join(jobFilesRoot(), relative)
  if (!fs.existsSync(fullPath)) return null
  return fs.readFileSync(fullPath)
}

export async function deleteJobFile(storedPath: string | null | undefined): Promise<void> {
  if (!storedPath) return
  if (isJobObjectStorageEnabled() && storedPath.startsWith(JOB_OBJECT_PREFIX)) {
    await createAdminClient().storage
      .from(JOB_FILES_BUCKET)
      .remove([objectPathFromKey(storedPath)])
    return
  }
  const relative = objectPathFromKey(storedPath)
  if (relative.includes("..")) return
  const fullPath = path.join(jobFilesRoot(), relative)
  if (fs.existsSync(fullPath)) {
    try { fs.unlinkSync(fullPath) } catch { /* ignore */ }
  }
}
