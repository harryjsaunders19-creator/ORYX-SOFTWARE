import { createId as nanoid } from "@paralleldrive/cuid2"
import { nowIso } from "@/lib/db/helpers"
import { REVISION_LETTERS } from "@/lib/constants"
import { useSupabaseBilling } from "@/lib/supabase/feature-flags"
import { composeJobAddress } from "@/modules/job-map/utils/job-address"
import { supabaseBillingRepo } from "@/modules/billing/supabase/repository"
import type { BillingHandoffRow } from "@/modules/billing/types/billing-types"
import { originalWorkItemId, workItemTitle } from "@/lib/migrations/work-items-backfill"
import { WORK_ITEM_ACTIVE_STATUSES, supabaseWorkItemRepo } from "../supabase/work-item-repository"
import { supabaseParentJobRepo } from "../supabase/parent-job-repository"
import { supabaseStatusHistoryRepo } from "../supabase/status-history-repository"
import type { ParentJobRow } from "../types/parent-job-types"
import type { DesignWorkItemRow } from "../types/design-work-item-types"
import type {
  ActiveWorkItemListRow,
  CreateParentJobInput,
  CreateRevisionWorkItemInput,
  ParentJobDashboard,
  UpdateWorkItemInput,
  WorkItemInvoiceSummary,
} from "../types/parent-dashboard-types"

function moneySum(...vals: Array<number | null | undefined>): number {
  return vals.reduce<number>((acc, v) => acc + (typeof v === "number" && Number.isFinite(v) ? v : 0), 0)
}

function workItemCommercial(w: DesignWorkItemRow): number {
  return moneySum(w.quoteValue, w.variationFees, w.additionalCharges)
}

export function buildInvoiceSummary(items: DesignWorkItemRow[]): WorkItemInvoiceSummary {
  let quotedTotal = 0
  let billedTotal = 0
  let readyTotal = 0
  let invoicedCount = 0
  for (const w of items) {
    const q = workItemCommercial(w)
    quotedTotal += q
    if (w.invoiceStatus === "INVOICED") {
      billedTotal += w.billedValue ?? q
      invoicedCount += 1
    } else if (w.invoiceStatus === "READY") {
      readyTotal += q
    }
  }
  return {
    quotedTotal,
    billedTotal,
    readyTotal,
    itemCount: items.length,
    invoicedCount,
  }
}

function isActiveStatus(status: string): boolean {
  return (WORK_ITEM_ACTIVE_STATUSES as readonly string[]).includes(status)
}

function pickCurrentActive(items: DesignWorkItemRow[]): DesignWorkItemRow | null {
  const active = items.filter(w => isActiveStatus(w.status))
  if (!active.length) return null
  return [...active].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
}

function nextLetterFromUsed(used: string[]): string | null {
  for (const letter of REVISION_LETTERS) {
    if (!used.includes(letter)) return letter
  }
  return null
}

async function findParentIdsForSearch(search: string): Promise<string[]> {
  const { rows } = await supabaseParentJobRepo.findMany({
    search,
    take: 200,
  })
  return rows.map(r => r.id)
}

function toListRow(item: DesignWorkItemRow, parent: ParentJobRow): ActiveWorkItemListRow {
  return {
    id: item.id,
    parentJobId: parent.id,
    drawingNumber: parent.drawingNumber,
    workLabel: item.title,
    workType: item.workType,
    revisionLetter: item.revisionLetter,
    clientCompany: parent.clientCompany,
    siteName: parent.siteName,
    address: parent.address,
    designer: item.designer,
    status: item.status,
    requiredByDate: item.requiredByDate,
    billable: item.billable,
    quoteValue: item.quoteValue,
    priority: item.priority,
    updatedAt: item.updatedAt,
  }
}

async function recordWorkItemHistory(opts: {
  workItem: DesignWorkItemRow
  fromStatus: string | null
  toStatus: string
  changedBy: string
  note?: string | null
}): Promise<void> {
  await supabaseStatusHistoryRepo.upsert({
    id: nanoid(),
    jobId: opts.workItem.legacyJobId,
    workItemId: opts.workItem.id,
    fromStatus: opts.fromStatus,
    toStatus: opts.toStatus,
    changedBy: opts.changedBy,
    changedAt: nowIso(),
    note: opts.note ?? null,
  })
}

async function recordBillingForWorkItem(
  item: DesignWorkItemRow,
  parent: ParentJobRow,
): Promise<void> {
  if (!useSupabaseBilling() || item.status !== "ISSUED") return
  if (!item.billable) return

  const existingByWork = await createAdminBillingFindByWorkItem(item.id)
  if (existingByWork) return
  if (item.legacyJobId) {
    const existingJob = await supabaseBillingRepo.findBySourceJobId(item.legacyJobId)
    if (existingJob) return
  }

  const now = nowIso()
  const handoff: BillingHandoffRow & { sourceWorkItemId?: string | null } = {
    id: nanoid(),
    sourceJobId: item.legacyJobId ?? item.id,
    billingEventType: item.workType === "REVISION" ? "REVISION_COMPLETED" : "JOB_COMPLETED",
    drawingNumber: parent.drawingNumber,
    itemType: item.workType === "REVISION" ? "REVISION" : "DESIGN",
    typeOfWorks: parent.typeOfWorks,
    customTypeDescription: parent.customTypeDescription,
    clientCompany: parent.clientCompany,
    address: parent.address,
    designer: item.designer || null,
    quoteValue: workItemCommercial(item) || item.quoteValue,
    quoteReference: item.quoteReference,
    completionDate: item.completedAt ?? now.slice(0, 10),
    addedToBillingQueueAt: now,
    clearedByAccountsAt: null,
    clearedBy: null,
    exportBatchId: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    sourceWorkItemId: item.id,
  }
  await upsertBillingWithWorkItem(handoff)
  await supabaseWorkItemRepo.update(item.id, {
    invoiceStatus: "READY",
    completedAt: item.completedAt ?? now.slice(0, 10),
  })
}

async function createAdminBillingFindByWorkItem(workItemId: string) {
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const { data, error } = await createAdminClient()
    .from("billing_handoffs")
    .select("*")
    .eq("source_work_item_id", workItemId)
    .is("cleared_by_accounts_at", null)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

async function upsertBillingWithWorkItem(
  row: BillingHandoffRow & { sourceWorkItemId?: string | null },
): Promise<void> {
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const { toSupabaseBillingHandoffRow } = await import("@/modules/billing/supabase/mapper")
  const payload = {
    ...toSupabaseBillingHandoffRow(row),
    source_work_item_id: row.sourceWorkItemId ?? null,
  }
  const { error } = await createAdminClient()
    .from("billing_handoffs")
    .upsert(payload, { onConflict: "id" })
  if (error) throw new Error(error.message)
}

async function retractBillingForWorkItem(item: DesignWorkItemRow): Promise<string | null> {
  if (!useSupabaseBilling()) return null
  const active = await createAdminBillingFindByWorkItem(item.id)
  if (active) {
    await supabaseBillingRepo.deleteHandoff(active.id as string)
    await supabaseWorkItemRepo.update(item.id, { invoiceStatus: "NONE" })
    return null
  }
  if (item.legacyJobId) {
    const byJob = await supabaseBillingRepo.findBySourceJobId(item.legacyJobId)
    if (byJob) {
      await supabaseBillingRepo.deleteHandoff(byJob.id)
      await supabaseWorkItemRepo.update(item.id, { invoiceStatus: "NONE" })
      return null
    }
  }
  return null
}

export const parentJobService = {
  async findUnique(id: string): Promise<ParentJobRow | null> {
    return supabaseParentJobRepo.findUnique(id)
  },

  async search(opts: {
    search?: string
    clientId?: string
    skip?: number
    take?: number
  }) {
    return supabaseParentJobRepo.findMany(opts)
  },

  async getDashboard(id: string): Promise<ParentJobDashboard | null> {
    const parent = await supabaseParentJobRepo.findUnique(id)
    if (!parent) return null
    const workItems = await supabaseWorkItemRepo.findByParent(id)
    const usedLetters = workItems
      .filter(w => w.workType === "REVISION" && w.revisionLetter)
      .map(w => w.revisionLetter!)
    const next = nextLetterFromUsed(usedLetters)
    return {
      parent,
      workItems,
      currentActive: pickCurrentActive(workItems),
      revisionCount: usedLetters.length,
      invoiceSummary: buildInvoiceSummary(workItems),
      canAddRevision: next != null && !parent.archivedAt,
      nextRevisionLetter: next,
    }
  },

  async createWithOriginal(input: CreateParentJobInput): Promise<ParentJobDashboard> {
    const now = nowIso()
    const changedBy = input.changedBy ?? "System"
    const siteName = input.siteName?.trim() ?? null
    const siteAddress = input.siteAddress?.trim() ?? null
    const address = input.address?.trim()
      ? input.address.trim()
      : composeJobAddress(siteName, siteAddress)

    const parent: ParentJobRow = {
      id: input.id,
      drawingNumber: input.drawingNumber,
      clientId: input.clientId ?? null,
      clientCompany: input.clientCompany,
      siteName,
      siteAddress,
      address,
      typeOfWorks: input.typeOfWorks,
      customTypeDescription: input.customTypeDescription ?? null,
      legacyTypeOfWorks: null,
      description: input.notes?.trim() || null,
      requestedBy: input.requestedBy,
      itemType: "DESIGN",
      archivedAt: null,
      archivedBy: null,
      latitude: null,
      longitude: null,
      geocodedAt: null,
      geocodedAddress: null,
      locationStatus: null,
      locationSource: null,
      legacyJobId: input.id,
      migratedAt: now,
      createdAt: now,
      updatedAt: now,
    }

    const original: DesignWorkItemRow = {
      id: originalWorkItemId(input.id),
      parentJobId: input.id,
      workType: "ORIGINAL",
      revisionLetter: null,
      title: "Original Issue",
      description: null,
      status: "NEW_REQUEST",
      designer: input.designer ?? "",
      priority: null,
      billable: true,
      requestedDate: input.requestedDate ?? null,
      requiredByDate: input.requiredByDate ?? null,
      notes: input.notes ?? null,
      commercialNotes: input.commercialNotes ?? null,
      quoteValue: input.quoteValue ?? null,
      quoteReference: input.quoteReference ?? null,
      quoteDate: input.quoteDate ?? null,
      variationFees: input.variationFees ?? null,
      additionalCharges: input.additionalCharges ?? null,
      invoiceStatus: "NONE",
      invoiceNumber: null,
      invoiceDate: null,
      billedValue: null,
      dateCreated: now,
      completedAt: null,
      legacyJobId: input.id,
      migratedAt: now,
      createdAt: now,
      updatedAt: now,
    }

    await supabaseParentJobRepo.upsert(parent)
    await supabaseWorkItemRepo.upsert(original)
    await recordWorkItemHistory({
      workItem: original,
      fromStatus: null,
      toStatus: "NEW_REQUEST",
      changedBy,
    })

    const dash = await this.getDashboard(input.id)
    if (!dash) throw new Error("Failed to load parent dashboard after create")
    return dash
  },

  async createRevision(
    parentId: string,
    input: CreateRevisionWorkItemInput,
  ): Promise<DesignWorkItemRow> {
    const dashboard = await this.getDashboard(parentId)
    if (!dashboard) throw new Error("Parent job not found")
    if (!dashboard.canAddRevision || !dashboard.nextRevisionLetter) {
      throw new Error("Cannot add another revision — maximum reached or parent archived")
    }

    const now = nowIso()
    const letter = dashboard.nextRevisionLetter
    const changedBy = input.changedBy ?? "System"
    const item: DesignWorkItemRow = {
      id: nanoid(),
      parentJobId: parentId,
      workType: "REVISION",
      revisionLetter: letter,
      title: workItemTitle("REVISION", letter),
      description: input.description ?? null,
      status: "NEW_REQUEST",
      designer: input.designer ?? "",
      priority: input.priority ?? null,
      billable: input.billable ?? false,
      requestedDate: now.slice(0, 10),
      requiredByDate: input.requiredByDate ?? null,
      notes: input.notes ?? input.description ?? null,
      commercialNotes: null,
      quoteValue: input.quoteValue ?? null,
      quoteReference: null,
      quoteDate: null,
      variationFees: null,
      additionalCharges: null,
      invoiceStatus: "NONE",
      invoiceNumber: null,
      invoiceDate: null,
      billedValue: null,
      dateCreated: now,
      completedAt: null,
      legacyJobId: null,
      migratedAt: now,
      createdAt: now,
      updatedAt: now,
    }

    await supabaseWorkItemRepo.upsert(item)
    await recordWorkItemHistory({
      workItem: item,
      fromStatus: null,
      toStatus: "NEW_REQUEST",
      changedBy,
      note: `Created ${item.title}`,
    })
    await supabaseParentJobRepo.update(parentId, { updatedAt: now })
    return item
  },
}

export const workItemService = {
  async findUnique(id: string): Promise<DesignWorkItemRow | null> {
    return supabaseWorkItemRepo.findUnique(id)
  },

  async findActiveList(opts: {
    search?: string
    status?: string
    designer?: string
    unassigned?: boolean
    skip?: number
    take?: number
  } = {}): Promise<{ rows: ActiveWorkItemListRow[]; total: number }> {
    let parentIds: string[] | undefined
    if (opts.search?.trim()) {
      parentIds = await findParentIdsForSearch(opts.search.trim())
      // Also allow empty parent match — fall through to work-item text search when no parents
      if (parentIds.length === 0) {
        const fallback = await supabaseWorkItemRepo.findActive({
          ...opts,
          parentIds: undefined,
        })
        if (!fallback.rows.length) return { rows: [], total: 0 }
        const parents = await Promise.all(
          [...new Set(fallback.rows.map(r => r.parentJobId))].map(id =>
            supabaseParentJobRepo.findUnique(id),
          ),
        )
        const parentMap = new Map(parents.filter(Boolean).map(p => [p!.id, p!]))
        return {
          rows: fallback.rows
            .map(w => {
              const p = parentMap.get(w.parentJobId)
              return p ? toListRow(w, p) : null
            })
            .filter((r): r is ActiveWorkItemListRow => r != null),
          total: fallback.total,
        }
      }
    }

    const { rows, total } = await supabaseWorkItemRepo.findActive({
      ...opts,
      parentIds: parentIds?.length ? parentIds : undefined,
      search: parentIds?.length ? undefined : opts.search,
    })

    const uniqueParentIds = [...new Set(rows.map(r => r.parentJobId))]
    const parents = await Promise.all(uniqueParentIds.map(id => supabaseParentJobRepo.findUnique(id)))
    const parentMap = new Map(parents.filter(Boolean).map(p => [p!.id, p!]))

    return {
      rows: rows
        .map(w => {
          const p = parentMap.get(w.parentJobId)
          return p && !p.archivedAt ? toListRow(w, p) : null
        })
        .filter((r): r is ActiveWorkItemListRow => r != null),
      total,
    }
  },

  async update(id: string, input: UpdateWorkItemInput): Promise<DesignWorkItemRow | null> {
    const existing = await supabaseWorkItemRepo.findUnique(id)
    if (!existing) return null
    const parent = await supabaseParentJobRepo.findUnique(existing.parentJobId)
    if (!parent) return null

    const changedBy = input.changedBy ?? "System"
    const statusChanged = input.status !== undefined && input.status !== existing.status
    const oldStatus = existing.status
    const now = nowIso()

    let completedAt = input.completedAt !== undefined ? input.completedAt : existing.completedAt
    if (statusChanged && input.status === "ISSUED" && !completedAt) {
      completedAt = now.slice(0, 10)
    }

    let historyNote: string | null = null
    if (statusChanged && oldStatus === "ISSUED" && input.status !== "ISSUED") {
      historyNote = await retractBillingForWorkItem(existing)
    }

    const updated = await supabaseWorkItemRepo.update(id, {
      status: input.status,
      designer: input.designer,
      description: input.description,
      notes: input.notes,
      commercialNotes: input.commercialNotes,
      billable: input.billable,
      priority: input.priority,
      quoteValue: input.quoteValue,
      quoteReference: input.quoteReference,
      quoteDate: input.quoteDate,
      variationFees: input.variationFees,
      additionalCharges: input.additionalCharges,
      requestedDate: input.requestedDate,
      requiredByDate: input.requiredByDate,
      invoiceStatus: input.invoiceStatus,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: input.invoiceDate,
      billedValue: input.billedValue,
      completedAt,
    })
    if (!updated) return null

    if (statusChanged) {
      await recordWorkItemHistory({
        workItem: updated,
        fromStatus: oldStatus,
        toStatus: input.status!,
        changedBy,
        note: historyNote,
      })
      if (input.status === "ISSUED") {
        await recordBillingForWorkItem(updated, parent)
      }
    } else if (input.designer !== undefined && input.designer !== existing.designer) {
      await recordWorkItemHistory({
        workItem: updated,
        fromStatus: updated.status,
        toStatus: updated.status,
        changedBy,
        note: `Designer assigned: ${input.designer.trim()}`,
      })
    }

    await supabaseParentJobRepo.update(parent.id, { updatedAt: now })
    return supabaseWorkItemRepo.findUnique(id)
  },
}

/** Used by UI / tests to know letter order is available. */
export const WORK_ITEM_REVISION_LETTERS = REVISION_LETTERS
