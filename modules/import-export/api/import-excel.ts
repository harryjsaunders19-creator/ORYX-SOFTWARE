import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { apiInternalError } from "@/shared/api-errors"

import { requireRole, requireFullAccess } from "@/shared/auth/auth"
import { importFromExcelBuffer } from "../services/excel-import"

/** Large imports batch-upsert to Supabase — allow up to 60s on Vercel (see vercel.json). */
export const maxDuration = 60

const excelFileSchema = z.custom<File>(
  (value) => {
    if (!value || typeof value !== "object") return false
    const v = value as Record<string, unknown>
    return typeof v.name === "string" && typeof v.arrayBuffer === "function"
  },
  "No file provided",
).refine(
  file =>
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.name.toLowerCase().endsWith(".xlsx"),
  "File must be an Excel (.xlsx) workbook",
)

export async function POST(req: NextRequest) {
  const auth = await requireFullAccess()
  if (auth instanceof NextResponse) return auth

  const { checkRateLimit, rateLimitedResponse, RATE_PRESETS } = await import("@/shared/auth/rate-limit")
  if (!(await checkRateLimit(`import:${auth.user.id}`, RATE_PRESETS.import))) {
    return rateLimitedResponse(3600)
  }

  try {
    const formData = await req.formData()
    const fileParsed = excelFileSchema.safeParse(formData.get("file"))
    if (!fileParsed.success) {
      return NextResponse.json({ error: fileParsed.error.issues[0]?.message ?? "Invalid upload" }, { status: 400 })
    }
    const buffer = await fileParsed.data.arrayBuffer()
    const result = await importFromExcelBuffer(buffer)

    return NextResponse.json(result)
  } catch (err) {
    return apiInternalError("import_export.api.import_excel", err)
  }
}
