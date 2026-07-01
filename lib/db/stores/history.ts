/** StatusHistory table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"
import { jobDb } from "./job"

export type { StatusHistoryRow } from "../history-types"
import type { StatusHistoryRow } from "../history-types"

export const historyDb = {
  forJob(jobId: string): StatusHistoryRow[] {
    return db.prepare("SELECT * FROM StatusHistory WHERE jobId = ? ORDER BY changedAt ASC").all(jobId) as StatusHistoryRow[]
  },
  addNote(jobId: string, note: string, changedBy: string): StatusHistoryRow {
    const job = jobDb.findUnique(jobId); const id = nanoid(); const now = nowIso()
    db.prepare("INSERT INTO StatusHistory (id,jobId,fromStatus,toStatus,changedBy,changedAt,note) VALUES (?,?,?,?,?,?,?)")
      .run(id, jobId, job?.status ?? null, job?.status ?? "", changedBy, now, note)
    return db.prepare("SELECT * FROM StatusHistory WHERE id = ?").get(id) as StatusHistoryRow
  },
}
