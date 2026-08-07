/**
 * PATCH /api/jobs/[id]/drawing-number
 *
 * Admin-only. Sets a job's drawing number in the primary store (Supabase on
 * Vercel) and floors the global drawing sequence so auto-allocation stays ahead.
 */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { apiInternalError } from "@/shared/api-errors"

import { requireFullAccess } from "@/shared/auth/auth"
import { jobService } from "../services/job-service"
import { historyService } from "../services/history-service"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"
import { seedDrawingSequenceFromNumber } from "@/shared/supabase/sequence-service"
import { createAdminClient } from "@/shared/supabase/admin"

type Ctx = { params: Promise<{ id: string }> }

const setDrawingNumberBodySchema = z.object({
  drawingNumber: z.string().optional(),
}).passthrough()

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireFullAccess()
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const job = await jobService.findUnique(id)
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })

    let bodyRaw: unknown
    try { bodyRaw = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
    const parsedBody = setDrawingNumberBodySchema.safeParse(bodyRaw)
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request body", field: parsedBody.error.issues[0]?.path?.[0] }, { status: 422 })
    }
    const body = parsedBody.data

    const newNumber = typeof body.drawingNumber === "string" ? body.drawingNumber.trim() : ""
    if (!newNumber) {
      return NextResponse.json({ error: "Drawing number is required" }, { status: 422 })
    }

    if (newNumber === job.drawingNumber) {
      return NextResponse.json(job)
    }

    if (isSupabaseOnly()) {
      const { data: clash, error } = await createAdminClient()
        .from("jobs")
        .select("id")
        .eq("drawing_number", newNumber)
        .neq("id", id)
        .maybeSingle()
      if (error) throw error
      if (clash) {
        return NextResponse.json({
          error: `Drawing number "${newNumber}" is already used by another job`,
        }, { status: 409 })
      }

      const updated = await jobService.setDrawingNumber(id, newNumber)
      if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })

      await historyService.addNote(
        id,
        `Drawing number changed: ${job.drawingNumber} → ${newNumber}`,
        auth.user.name,
      )
      await seedDrawingSequenceFromNumber(newNumber)
      return NextResponse.json(updated)
    }

    // Local hybrid: SQLite remains source of truth, then mirror.
    const { db, sequenceDb } = await import("@/lib/db")
    const existing = await jobService.findMany({ take: 10000 })
    const duplicate = existing.find(j => j.drawingNumber === newNumber && j.id !== id)
    if (duplicate) {
      return NextResponse.json({
        error: `Drawing number "${newNumber}" is already used by another job`,
      }, { status: 409 })
    }

    db.prepare("UPDATE Job SET drawingNumber = ?, updatedAt = ? WHERE id = ?")
      .run(newNumber, new Date().toISOString(), id)

    await historyService.addNote(
      id,
      `Drawing number changed: ${job.drawingNumber} → ${newNumber}`,
      auth.user.name,
    )
    sequenceDb.syncFromExistingJobs()

    const updated = await jobService.syncFromSqlite(id)
    return NextResponse.json(updated)
  } catch (err) {
    return apiInternalError("jobs.api.drawing-number", err)
  }
}
