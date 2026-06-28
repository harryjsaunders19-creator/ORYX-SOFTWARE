import { NextRequest, NextResponse } from "next/server"
import { listResponse } from "@/lib/api-cache"
import { clientService } from "@/lib/services/client-service"
import { createId } from "@paralleldrive/cuid2"
import { requireSignIn } from "@/lib/auth"
import { canViewClientAnalytics } from "@/lib/permissions"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const sp         = req.nextUrl.searchParams
    const search     = sp.get("search")     ?? ""
    const activeOnly = sp.get("active")     !== "false"   // default: only active
    const page       = Math.max(1, parseInt(sp.get("page")  ?? "1"))
    const limit      = Math.max(1, Math.min(200, parseInt(sp.get("limit") ?? "50")))

    const role = auth.user.role as import("@/lib/permissions").Role
    const [clients, total] = await Promise.all([
      clientService.findManyWithMeta({ search, activeOnly, skip: (page - 1) * limit, take: limit }),
      clientService.count({ search, activeOnly }),
    ])

    const redacted = canViewClientAnalytics(role)
      ? clients
      : clients.map(({ activeJobCount: _ac, ...c }) => ({ ...c, activeJobCount: null }))

    return listResponse({ clients: redacted, total, page, limit })
  } catch (err) {
    console.error("[GET /api/clients]", err)
    return NextResponse.json({ error: "Failed to load clients" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name) return NextResponse.json({ error: "Company name is required" }, { status: 422 })

    // Duplicate check
    const existing = await clientService.findByName(name)
    if (existing) {
      return NextResponse.json({
        error:    `A client named "${existing.name}" already exists.`,
        existing,
      }, { status: 409 })
    }

    const client = await clientService.create({
      id:             createId(),
      name,
      contactName:    body.contactName    ? String(body.contactName).trim()    : null,
      email:          body.email          ? String(body.email).trim()          : null,
      phone:          body.phone          ? String(body.phone).trim()          : null,
      billingAddress: body.billingAddress ? String(body.billingAddress).trim() : null,
      notes:          body.notes          ? String(body.notes).trim()          : null,
      accountCode:    body.accountCode    ? String(body.accountCode).trim()    : null,
    })
    return NextResponse.json(client, { status: 201 })
  } catch (err) {
    console.error("[POST /api/clients]", err)
    return NextResponse.json({ error: "Failed to create client" }, { status: 500 })
  }
}
