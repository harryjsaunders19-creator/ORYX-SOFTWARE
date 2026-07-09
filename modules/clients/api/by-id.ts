import { NextRequest, NextResponse } from "next/server"
import { clientService } from "../services/client-service"
import { requireSignIn, requireRole } from "@/shared/auth/auth"
import { canViewCommercialValues, canViewClientAnalytics } from "@/shared/auth/permissions"
import { resourceResponse } from "@/shared/utils/api-cache"
import { errorMessage } from "@/shared/utils/error-message"
import { parseContactsFromBody } from "./parse-contacts"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const client = await clientService.findUnique(id)
    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const contacts = await clientService.contactsForClient(id)
    const role = auth.user.role as import("@/shared/auth/permissions").Role
    const jobs = clientService.jobsForClient(id, 50)

    // Engineers see the client and their jobs but no aggregate stats
    if (!canViewClientAnalytics(role)) {
      return resourceResponse({ client, contacts, stats: null, jobs })
    }

    const rawStats = clientService.stats(id)
    const stats = { ...rawStats, totalInvoicedValue: canViewCommercialValues(role) ? rawStats.totalInvoicedValue : null }
    return resourceResponse({ client, contacts, stats, jobs })
  } catch (err) {
    console.error("[GET /api/clients/[id]]", err)
    return NextResponse.json({ error: "Failed to load client" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name) return NextResponse.json({ error: "Company name cannot be empty" }, { status: 422 })
      // Duplicate check (excluding self)
      const existing = await clientService.findByName(name)
      if (existing && existing.id !== id) {
        return NextResponse.json({
          error: `A client named "${existing.name}" already exists.`, existing,
        }, { status: 409 })
      }
    }

    const contacts = parseContactsFromBody(body)
    const updated = await clientService.update(id, {
      ...(body.name          !== undefined && { name:           String(body.name).trim() }),
      ...(body.contactName   !== undefined && { contactName:    body.contactName   ? String(body.contactName).trim()   : null }),
      ...(body.email         !== undefined && { email:          body.email         ? String(body.email).trim()         : null }),
      ...(body.phone         !== undefined && { phone:          body.phone         ? String(body.phone).trim()         : null }),
      ...(body.billingAddress!== undefined && { billingAddress: body.billingAddress ? String(body.billingAddress).trim(): null }),
      ...(body.notes         !== undefined && { notes:          body.notes         ? String(body.notes).trim()         : null }),
      ...(body.accountCode   !== undefined && { accountCode:    body.accountCode   ? String(body.accountCode).trim()   : null }),
      ...(body.active        !== undefined && { active:         body.active ? 1 : 0 }),
      ...(contacts !== undefined && { contacts }),
    })
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const savedContacts = await clientService.contactsForClient(id)
    return NextResponse.json({ ...updated, contacts: savedContacts })
  } catch (err) {
    console.error("[PATCH /api/clients/[id]]", err)
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireRole(["ADMIN"])
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const archived = await clientService.archive(id, auth.user.id, auth.user.name)
    if (!archived) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ archived: true, client: archived })
  } catch (err) {
    console.error("[DELETE /api/clients/[id]]", err)
    return NextResponse.json({ error: "Failed to archive client", detail: errorMessage(err) }, { status: 500 })
  }
}
