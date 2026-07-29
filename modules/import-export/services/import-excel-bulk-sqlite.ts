/**
 * Fast bulk import — SQLite path for local/CI.
 * Dual-write was removed; see docs/sqlite-sunset.md.
 */
import { db } from "@/lib/db/connection"
import type { ClientRow } from "@/modules/clients/types"
import type { JobRow } from "@/modules/jobs/types/job-types"
import type { QuoteRow } from "@/modules/quotes/types"
import { clientDb, jobDb, quoteDb } from "@/lib/db/stores"

export async function bulkImportClients(clients: ClientRow[]): Promise<void> {
  if (!clients.length) return
  db.transaction(() => {
    for (const client of clients) {
      clientDb.rawInsertOrIgnore(client)
    }
  })()
}

export async function bulkImportJobs(jobs: JobRow[]): Promise<void> {
  if (!jobs.length) return
  db.transaction(() => {
    for (const job of jobs) {
      jobDb.rawInsertOrIgnore(job)
      if (job.status === "ISSUED") {
        jobDb._recordBillingHandoffIfIssued(job)
      }
    }
  })()
}

export async function bulkImportQuotes(quotes: QuoteRow[]): Promise<void> {
  if (!quotes.length) return
  db.transaction(() => {
    for (const quote of quotes) {
      quoteDb.rawInsertOrIgnore(quote)
    }
  })()
}
