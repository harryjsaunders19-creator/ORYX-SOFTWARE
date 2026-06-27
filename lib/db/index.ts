/**
 * lib/db — SQLite database layer via better-sqlite3.
 * Import from "@/lib/db" as before; this barrel replaces the old monolithic lib/db.ts.
 */
import "./schema"

export { db, DB_PATH, DB_DIR, DB_EXISTED } from "./connection"
export { buildWhere, safeOrder, nowIso } from "./helpers"
export type { WhereClause, FindManyOptions } from "./helpers"
export * from "./stores"
