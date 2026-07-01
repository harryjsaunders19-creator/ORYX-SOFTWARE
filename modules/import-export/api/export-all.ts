import { NextResponse } from "next/server"
import { format } from "date-fns"
import { requireRole } from "@/shared/auth/auth"
import { globalExportToBuffer } from "../services/global-export"

export async function GET() {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const buf = await globalExportToBuffer()
    const filename = `oryx-export-${format(new Date(), "yyyy-MM-dd")}.xlsx`

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error("[GET /api/export/all]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
