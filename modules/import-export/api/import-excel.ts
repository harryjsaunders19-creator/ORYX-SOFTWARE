import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { requireRole } from "@/shared/auth/auth"
import { importFromExcelBuffer } from "../services/excel-import"

/** Large imports batch-upsert to Supabase — allow up to 60s on Vercel (see vercel.json). */
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const formData = await req.formData()
    const file = formData.get("file")

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const mimeType = (file as File).type
    if (
      mimeType !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" &&
      !((file as File).name ?? "").endsWith(".xlsx")
    ) {
      return NextResponse.json({ error: "File must be an Excel (.xlsx) workbook" }, { status: 400 })
    }

    const buffer = await (file as File).arrayBuffer()
    const result = await importFromExcelBuffer(buffer)

    return NextResponse.json(result)
  } catch (err) {
    return apiInternalError("import_export.api.import_excel", err)
  }
}
