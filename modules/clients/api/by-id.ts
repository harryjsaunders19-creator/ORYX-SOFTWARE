import { NextRequest, NextResponse } from "next/server"
import { clientService } from "../services/client-service"
import { requireSignIn, requireRole } from "@/shared/auth/auth"
import { canViewCommercialValues, canViewClientAnalytics } from "@/shared/auth/permissions"
import { resourceResponse } from "@/shared/utils/api-cache"
import { apiInternalError } from "@/shared/api-errors"
import { parseContactsFromBody } from "./parse-contacts"
import { isWorkItemsModelEnabled } from "@/shared/supabase/feature-flags"

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
    let jobs = await clientService.jobsForClient(id, 50)

    if (isWorkItemsModelEnabled()) {
      try {
        const { supabaseParentJobRepo } = await import("@/modules/jobs/supabase/parent-job-repository")
        const { supabaseWorkItemRepo } = await import("@/modules/jobs/supabase/work-item-repository")
        const { rows: parents } = await supabaseParentJobRepo.findMany({
          clientId: id,
          take: 50,
        })
        const enriched = await Promise.all(parents.map(async p => {
          const items = await supabaseWorkItemRepo.findByParent(p.id)
          const current = [...items]
            .filter(w => w.status !== "ISSUED")
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
            ?? items[items.length - 1]
          const revisionCount = items.filter(w => w.workType === "REVISION").length
          return {
            id: p.id,
            drawingNumber: p.drawingNumber,
            itemType: "DESIGN",
            address: p.address,
            siteName: p.siteName,
            siteAddress: p.siteAddress,
            typeOfWorks: p.typeOfWorks,
            customTypeDescription: p.customTypeDescription,
            legacyTypeOfWorks: p.legacyTypeOfWorks,
            clientCompany: p.clientCompany,
            clientId: p.clientId,
            requestedBy: p.requestedBy,
            status: current?.status ?? "NEW_REQUEST",
            designer: current?.designer ?? "",
            dateCreated: p.createdAt,
            dateCompleted: current?.completedAt ?? null,
            notes: p.description,
            quoteValue: current?.quoteValue ?? null,
            quoteReference: current?.quoteReference ?? null,
            quoteDate: current?.quoteDate ?? null,
            commercialNotes: current?.commercialNotes ?? null,
            variationFees: current?.variationFees ?? null,
            additionalCharges: current?.additionalCharges ?? null,
            invoiceId: current?.invoiceNumber ?? null,
            billingStatus: current?.invoiceStatus ?? null,
            billingBatchId: null,
            requestedDate: current?.requestedDate ?? null,
            requiredByDate: current?.requiredByDate ?? null,
            parentJobId: null,
            revisionLetter: current?.revisionLetter ?? null,
            billable: current?.billable ?? true,
            archivedAt: p.archivedAt,
            archivedBy: p.archivedBy,
            latitude: p.latitude,
            longitude: p.longitude,
            geocodedAt: p.geocodedAt,
            geocodedAddress: p.geocodedAddress,
            locationStatus: p.locationStatus,
            locationSource: p.locationSource,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
            hasRevisions: revisionCount > 0,
            revisionCount,
            currentRevisionId: current?.id ?? null,
            currentRevisionLetter: current?.revisionLetter ?? null,
          }
        }))

        // Keep non-design / non-migrated jobs from legacy table
        const legacyNonDesign = jobs.filter(j =>
          j.parentJobId == null && j.itemType !== "DESIGN" && j.itemType !== "REVISION",
        )
        jobs = [...enriched, ...legacyNonDesign] as typeof jobs
      } catch (err) {
        console.warn("[clients.by_id] work-items enrichment failed:", err)
      }
    }

    // Engineers see the client and their jobs but no aggregate stats
    if (!canViewClientAnalytics(role)) {
      return resourceResponse({ client, contacts, stats: null, jobs })
    }

    const rawStats = await clientService.stats(id)
    const stats = { ...rawStats, totalInvoicedValue: canViewCommercialValues(role) ? rawStats.totalInvoicedValue : null }
    return resourceResponse({ client, contacts, stats, jobs })
  } catch (err) {
    return apiInternalError("clients.by_id.get", err)
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
    return apiInternalError("clients.by_id.patch", err)
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
    return apiInternalError("clients.by_id.delete", err)
  }
}
