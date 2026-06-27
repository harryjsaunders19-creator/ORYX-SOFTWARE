import { NextResponse } from "next/server"
import { dbHealthCheck, sequenceDb } from "@/lib/db"
import { jobService } from "@/lib/services/job-service"
import { createId } from "@paralleldrive/cuid2"
import { requireRole } from "@/lib/auth"

export async function GET() {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  const checks: Record<string, { ok: boolean; message: string; detail?: Record<string, unknown> | string | number | null }> = {}

  try {
    const h = dbHealthCheck()
    checks.database = {
      ok: h.ok,
      message: h.ok ? `Connected — ${h.jobCount} job(s), ${h.historyCount} history event(s)` : "Connection failed",
      detail: { path: h.path, jobCount: h.jobCount, historyCount: h.historyCount },
    }
  } catch (err) {
    checks.database = { ok: false, message: "Database error", detail: String(err) }
  }

  try {
    const total = await jobService.count()
    checks.read = { ok: true, message: `Read OK — ${total} job(s)` }
  } catch (err) {
    checks.read = { ok: false, message: "Read failed", detail: String(err) }
  }

  let testId: string | null = null
  try {
    testId = createId()
    const testDrawingNumber = `__HEALTH__/${Date.now()}`
    await jobService.create({
      id: testId, drawingNumber: testDrawingNumber,
      address: "__health_check__", typeOfWorks: "Access Scaffold",
      clientCompany: "Test", requestedBy: "Test",
      status: "NEW_REQUEST", designer: "Test",
      dateCompleted: null,
      notes: null, changedBy: "HealthCheck",
    })
    const written = await jobService.findUnique(testId)
    checks.write = { ok: !!written, message: written ? "Write + delete OK" : "Write failed silently" }
  } catch (err) {
    checks.write = { ok: false, message: "Write test failed", detail: String(err) }
  } finally {
    if (testId) {
      try { await jobService.delete(testId) } catch { /* best-effort cleanup */ }
    }
  }

  try {
    const seq = sequenceDb.nextSequence("__health__")
    checks.sequence = { ok: typeof seq === "number", message: `Sequence OK (test value: ${seq})` }
  } catch (err) {
    checks.sequence = { ok: false, message: "Sequence failed", detail: String(err) }
  }

  try {
    const h = dbHealthCheck()
    checks.history = { ok: true, message: `StatusHistory OK — ${h.historyCount} event(s)` }
  } catch (err) {
    checks.history = { ok: false, message: "History table error", detail: String(err) }
  }

  const allOk = Object.values(checks).every(c => c.ok)
  return NextResponse.json(
    { status: allOk ? "healthy" : "degraded", checks, time: new Date().toISOString(),
      runtime: { node: process.version, env: process.env.NODE_ENV } },
    { status: allOk ? 200 : 503 },
  )
}
