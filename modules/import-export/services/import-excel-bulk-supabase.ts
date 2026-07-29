/**
 * Fast bulk import — Supabase path (isSupabaseOnly).
 * Dual-write / SQLite mirror removed; see docs/sqlite-sunset.md.
 */
import type { ClientRow } from "@/modules/clients/types"
import type { JobRow } from "@/modules/jobs/types/job-types"
import type { QuoteRow } from "@/modules/quotes/types"
import { supabaseClientRepo } from "@/modules/clients/supabase/repository"
import { supabaseJobRepo } from "@/modules/jobs/supabase/repository"
import { supabaseQuoteRepo } from "@/modules/quotes/supabase/repository"

const CHUNK = 100

export async function bulkImportClients(clients: ClientRow[]): Promise<void> {
  if (!clients.length) return
  for (let i = 0; i < clients.length; i += CHUNK) {
    await supabaseClientRepo.upsertMany(clients.slice(i, i + CHUNK))
  }
}

export async function bulkImportJobs(jobs: JobRow[]): Promise<void> {
  if (!jobs.length) return
  for (let i = 0; i < jobs.length; i += CHUNK) {
    await supabaseJobRepo.upsertManyForImport(jobs.slice(i, i + CHUNK))
  }
}

export async function bulkImportQuotes(quotes: QuoteRow[]): Promise<void> {
  if (!quotes.length) return
  for (let i = 0; i < quotes.length; i += CHUNK) {
    await supabaseQuoteRepo.upsertManyForImport(quotes.slice(i, i + CHUNK))
  }
}
