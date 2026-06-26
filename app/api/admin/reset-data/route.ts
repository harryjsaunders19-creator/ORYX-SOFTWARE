/**
 * POST /api/admin/reset-data
 *
 * Wipes all jobs, clients, quotes, billing data, and sequences.
 * Preserves user accounts. Requires ADMIN role + password confirmation.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireRole, getCurrentUser } from "@/lib/auth"
import { verifyPassword } from "@/lib/password"
import { userDb } from "@/lib/db"
import Database from "better-sqlite3"
import path from "path"

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), ".data", "oryx.db")

export async function POST(req: NextRequest) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    let body: { password?: string; confirmPhrase?: string }
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const password = typeof body.password === "string" ? body.password : ""
    const confirmPhrase = typeof body.confirmPhrase === "string" ? body.confirmPhrase.trim() : ""

    if (!password) {
      return NextResponse.json({ error: "Password is required" }, { status: 422 })
    }
    if (confirmPhrase !== "RESET ALL DATA") {
      return NextResponse.json({ error: "Confirmation phrase does not match" }, { status: 422 })
    }

    const user = await getCurrentUser()
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 })
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 })
    }

    const db = new Database(DB_PATH)
    const counts = db.transaction(() => {
      const jobCount = (db.prepare("SELECT COUNT(*) as n FROM Job").get() as { n: number }).n
      const clientCount = (db.prepare("SELECT COUNT(*) as n FROM Client").get() as { n: number }).n
      const quoteCount = (db.prepare("SELECT COUNT(*) as n FROM Quote").get() as { n: number }).n

      db.prepare("DELETE FROM BillingExportSnapshot").run()
      db.prepare("DELETE FROM BillingExportBatch").run()
      db.prepare("DELETE FROM BillingHandoff").run()
      db.prepare("DELETE FROM StatusHistory").run()
      db.prepare("DELETE FROM TypeOfWorksMigrationLog").run()
      db.prepare("DELETE FROM QuoteLineItem").run()
      db.prepare("DELETE FROM Quote").run()
      db.prepare("DELETE FROM InvoiceItem").run()
      db.prepare("DELETE FROM Invoice").run()
      db.prepare("DELETE FROM InvoiceSequence").run()
      db.prepare("DELETE FROM ExportBatchItem").run()
      db.prepare("DELETE FROM ExportBatch").run()
      db.prepare("DELETE FROM Job").run()
      db.prepare("DELETE FROM DrawingSequence").run()
      db.prepare("DELETE FROM RefSequence").run()
      db.prepare("DELETE FROM ClientHold").run()
      db.prepare("DELETE FROM Client").run()

      return { jobCount, clientCount, quoteCount }
    })()
    db.close()

    console.log(`[RESET ALL DATA] Performed by ${user.name} (${user.email}). Cleared ${counts.jobCount} jobs, ${counts.clientCount} clients, ${counts.quoteCount} quotes.`)

    return NextResponse.json({
      ok: true,
      cleared: counts,
    })
  } catch (err) {
    console.error("[POST /api/admin/reset-data]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
