/** SQLite health check helper. */
import { db, DB_PATH } from "../connection"

export function dbHealthCheck() {
  try {
    const jobs    = (db.prepare("SELECT COUNT(*) as n FROM Job").get() as { n: number }).n
    const history = (db.prepare("SELECT COUNT(*) as n FROM StatusHistory").get() as { n: number }).n
    return { ok: true, jobCount: jobs, historyCount: history, path: DB_PATH }
  } catch {
    return { ok: false, jobCount: -1, historyCount: -1, path: DB_PATH }
  }
}
