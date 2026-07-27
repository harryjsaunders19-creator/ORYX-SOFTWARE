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

export function useJobObjectStorage(): boolean {
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
  if (useJobObjectStorage()) {
    const { error } = await createAdminClient().storage
      .from(JOB_FILES_BUCKET)
      .upload(objectPathFromKey(key), params.data, {
        contentType: params.contentType,
        upsert: true,
      })
    if (error) throw error
    return key
  }

  const relative = objectPathFromKey(key)
  const fullPath = path.join(jobFilesRoot(), relative)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, params.data)
  return key
}

export async function readJobFile(storedPath: string): Promise<Buffer | null> {
  if (!storedPath) return null
  if (useJobObjectStorage() && storedPath.startsWith(JOB_OBJECT_PREFIX)) {
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
  if (useJobObjectStorage() && storedPath.startsWith(JOB_OBJECT_PREFIX)) {
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
