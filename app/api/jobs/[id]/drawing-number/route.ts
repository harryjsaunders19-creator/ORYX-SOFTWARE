/**
 * PATCH /api/jobs/[id]/drawing-number
 *
 * Admin-only. Allows manually setting a job's drawing number.
 * After the change, reconciles the DrawingSequence counter so
 * future auto-generated numbers continue correctly.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { jobService } from "@/lib/services/job-service"
import { sequenceDb } from "@/lib/db"
import { historyService } from "@/lib/services/history-service"

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const job = await jobService.findUnique(id)
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })

    let body: { drawingNumber?: string }
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const newNumber = typeof body.drawingNumber === "string" ? body.drawingNumber.trim() : ""
    if (!newNumber) {
      return NextResponse.json({ error: "Drawing number is required" }, { status: 422 })
    }

    if (newNumber === job.drawingNumber) {
      return NextResponse.json(job)
    }

    // Check for duplicates
    const existing = await jobService.findMany({ take: 10000 })
    const duplicate = existing.find(j => j.drawingNumber === newNumber && j.id !== id)
    if (duplicate) {
      return NextResponse.json({
        error: `Drawing number "${newNumber}" is already used by another job`,
      }, { status: 409 })
    }

    // Update the drawing number directly
    const { db } = await import("@/lib/db")
    db.prepare('UPDATE Job SET drawingNumber = ?, updatedAt = ? WHERE id = ?')
      .run(newNumber, new Date().toISOString(), id)

    // Log the change in status history
    await historyService.addNote(id, `Drawing number changed: ${job.drawingNumber} → ${newNumber}`, auth.user.name)

    // Reconcile sequence counter so future numbers don't collide
    sequenceDb.syncFromExistingJobs()

    const updated = await jobService.syncFromSqlite(id)
    return NextResponse.json(updated)
  } catch (err) {
    console.error("[PATCH /api/jobs/[id]/drawing-number]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
