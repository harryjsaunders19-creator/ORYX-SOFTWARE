/**
 * Boot-time checks that Vercel never silently stores uploaded files in /tmp.
 *
 * useJobObjectStorage / useEmployeeObjectStorage currently follow
 * isSupabaseAdminConfigured(), which instrumentation already requires — so the
 * boolean assert is belt-and-suspenders. The bucket existence probe catches the
 * real misconfig: credentials present but Storage migrations not applied.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { isExperimentalEnabled } from "@/shared/experimental/experimental-features"
import {
  JOB_FILES_BUCKET,
  useJobObjectStorage,
} from "@/modules/job-documents/services/job-files"
import {
  EMPLOYEE_FILES_BUCKET,
  useEmployeeObjectStorage,
} from "@/modules/employees/services/employee-files"

async function assertStorageBucketExists(bucket: string, migrationHint: string): Promise<void> {
  const client = createAdminClient()
  const { data, error } = await client.storage.getBucket(bucket)
  if (error || !data) {
    const detail = error?.message ? ` (${error.message})` : ""
    throw new Error(
      `VERCEL=1 but Supabase Storage bucket "${bucket}" is missing or inaccessible${detail}. ` +
      `Apply ${migrationHint} (or create the private bucket) before deploying — ` +
      `otherwise uploads cannot be stored durably.`,
    )
  }
}

/** Fail fast on Vercel when object storage is unavailable for durable file uploads. */
export async function assertVercelObjectStorageReady(): Promise<void> {
  if (!useJobObjectStorage()) {
    throw new Error(
      "VERCEL=1 but job object storage is not active. " +
      "Uploaded job documents would land in ephemeral /tmp and vanish on cold start. " +
      "Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.",
    )
  }
  await assertStorageBucketExists(JOB_FILES_BUCKET, "migration 037_job_documents.sql")

  // Employee module is experimental/off in production — only require its bucket when enabled.
  if (isExperimentalEnabled("employees")) {
    if (!useEmployeeObjectStorage()) {
      throw new Error(
        "VERCEL=1 with employees enabled but employee object storage is not active. " +
        "Uploaded photos/documents would land in ephemeral /tmp. " +
        "Set Supabase admin credentials or disable the employees experimental flag.",
      )
    }
    await assertStorageBucketExists(EMPLOYEE_FILES_BUCKET, "migration 028_employee_files_storage.sql")
  }
}
