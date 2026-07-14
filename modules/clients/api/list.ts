import { NextRequest, NextResponse } from "next/server"
import { listResponse } from "@/shared/utils/api-cache"
import { clientService } from "../services/client-service"
import { createId } from "@paralleldrive/cuid2"
import { requireSignIn } from "@/shared/auth/auth"
import { parseContactsFromBody } from "./parse-contacts"
import { canViewClientAnalytics } from "@/shared/auth/permissions"
import { apiInternalError } from "@/shared/api-errors"
import { parsePageParam, parseLimitParam } from "@/shared/utils/pagination"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const sp         = req.nextUrl.searchParams
    const search     = sp.get("search")     ?? ""
    const activeOnly = sp.get("active")     !== "false"   // default: only active
    const page       = parsePageParam(sp.get("page"))
    const limit      = parseLimitParam(sp.get("limit"), 50, 200)

    const role = auth.user.role as import("@/shared/auth/permissions").Role
    const [clients, total] = await Promise.all([
      clientService.findManyWithMeta({ search, activeOnly, skip: (page - 1) * limit, take: limit }),
      clientService.count({ search, activeOnly }),
    ])

    const redacted = canViewClientAnalytics(role)
      ? clients
      : clients.map(({ activeJobCount: _ac, ...c }) => ({ ...c, activeJobCount: null }))

    return listResponse({ clients: redacted, total, page, limit })
  } catch (err) {
    return apiInternalError("clients.list.get", err)
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

    const contacts = parseContactsFromBody(body)
    const client = await clientService.create({
      id:             createId(),
      name,
      contactName:    body.contactName    ? String(body.contactName).trim()    : null,
      email:          body.email          ? String(body.email).trim()          : null,
      phone:          body.phone          ? String(body.phone).trim()          : null,
      billingAddress: body.billingAddress ? String(body.billingAddress).trim() : null,
      notes:          body.notes          ? String(body.notes).trim()          : null,
      accountCode:    body.accountCode    ? String(body.accountCode).trim()    : null,
      contacts,
    })
    const savedContacts = await clientService.contactsForClient(client.id)
    return NextResponse.json({ ...client, contacts: savedContacts }, { status: 201 })
  } catch (err) {
    return apiInternalError("clients.list.create", err)
  }
}
