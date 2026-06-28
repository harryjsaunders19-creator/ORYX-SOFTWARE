import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { importFromExcelBuffer } from "@/lib/excel-import"

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
    console.error("[POST /api/import/excel]", err)
    return NextResponse.json({ error: "Import failed: " + (err instanceof Error ? err.message : String(err)) }, { status: 500 })
  }
}
