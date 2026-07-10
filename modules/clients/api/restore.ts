import { NextRequest, NextResponse } from "next/server"import { apiInternalError } from "@/shared/api-errors"

import { requireRole } from "@/shared/auth/auth"
import { clientService } from "../services/client-service"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireRole(["ADMIN"])
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const client = await clientService.findUnique(id)
    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (client.active === 1) return NextResponse.json({ error: "Client is not archived" }, { status: 409 })

    const restored = await clientService.restore(id, auth.user.id, auth.user.name)
    if (!restored) return NextResponse.json({ error: "Restore failed" }, { status: 500 })
    return NextResponse.json({ ok: true, client: restored })
  } catch (err) {
    return apiInternalError("clients.api.restore", err)
  }
}
