/**
 * Live logical export of recovery-critical tables.
 *
 * Unlike SQLite filesystem dumps, this works when Supabase is the primary
 * store on Vercel — it reads through the service layer and returns a single
 * JSON pack an admin can download and later re-import.
 */
import { format } from "date-fns"
import { jobService } from "@/modules/jobs"
import { clientService } from "@/modules/clients"
import { quoteService } from "@/modules/quotes"
import { userService } from "@/modules/users"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"
import { MAX_GLOBAL_EXPORT_ROWS } from "@/modules/import-export/constants"

export const LOGICAL_BACKUP_VERSION = 1 as const

export type LogicalBackupPack = {
  version: typeof LOGICAL_BACKUP_VERSION
  kind: "oryx-logical-backup"
  exportedAt: string
  source: "supabase" | "sqlite"
  counts: Record<string, number>
  tables: {
    users: Array<{
      id: string
      name: string
      email: string | null
      role: string
      active: number
      passwordHash: string | null
      mustChangePassword: number
      createdAt: string
      updatedAt: string
    }>
    clients: Array<{
      id: string
      name: string
      contactName: string | null
      phone: string | null
      email: string | null
      billingAddress: string | null
      notes: string | null
      accountCode: string | null
      active: number
      createdAt: string
      updatedAt: string
    }>
    jobs: Array<{
      id: string
      drawingNumber: string
      itemType: string
      address: string
      typeOfWorks: string
      customTypeDescription: string | null
      clientCompany: string
      clientId: string | null
      requestedBy: string
      status: string
      designer: string
      quoteValue: number | null
      variationFees: number | null
      quoteReference: string | null
      dateCreated: string
      requiredByDate: string | null
      dateCompleted: string | null
      notes: string | null
      parentJobId: string | null
      revisionLetter: string | null
      updatedAt: string
    }>
    quotes: Array<{
      id: string
      quoteNumber: string
      clientId: string | null
      clientCompany: string
      contactName: string | null
      address: string
      description: string
      quoteValue: number
      vatRate: number | null
      quoteDate: string
      expiryDate: string | null
      status: string
      notes: string | null
      createdBy: string
      createdAt: string
      updatedAt: string
    }>
  }
}

export async function buildLogicalBackupPack(): Promise<LogicalBackupPack> {
  const [users, clients, jobs, quotes] = await Promise.all([
    userService.findMany(),
    clientService.findManyWithMeta({ take: MAX_GLOBAL_EXPORT_ROWS }),
    jobService.findMany({
      orderBy: { field: "dateCreated", dir: "desc" },
      take: MAX_GLOBAL_EXPORT_ROWS,
    }),
    quoteService.findMany({ take: MAX_GLOBAL_EXPORT_ROWS }),
  ])

  const pack: LogicalBackupPack = {
    version: LOGICAL_BACKUP_VERSION,
    kind: "oryx-logical-backup",
    exportedAt: new Date().toISOString(),
    source: isSupabaseOnly() ? "supabase" : "sqlite",
    counts: {
      users: users.length,
      clients: clients.length,
      jobs: jobs.length,
      quotes: quotes.length,
    },
    tables: {
      users: users.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active,
        passwordHash: u.passwordHash,
        mustChangePassword: u.mustChangePassword,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
      clients: clients.map(c => ({
        id: c.id,
        name: c.name,
        contactName: c.contactName,
        phone: c.phone,
        email: c.email,
        billingAddress: c.billingAddress,
        notes: c.notes,
        accountCode: c.accountCode,
        active: c.active,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      jobs: jobs.map(j => ({
        id: j.id,
        drawingNumber: j.drawingNumber,
        itemType: j.itemType ?? "DESIGN",
        address: j.address,
        typeOfWorks: j.typeOfWorks,
        customTypeDescription: j.customTypeDescription ?? null,
        clientCompany: j.clientCompany,
        clientId: j.clientId,
        requestedBy: j.requestedBy,
        status: j.status,
        designer: j.designer ?? "",
        quoteValue: j.quoteValue,
        variationFees: j.variationFees,
        quoteReference: j.quoteReference,
        dateCreated: j.dateCreated,
        requiredByDate: j.requiredByDate,
        dateCompleted: j.dateCompleted,
        notes: j.notes,
        parentJobId: j.parentJobId,
        revisionLetter: j.revisionLetter,
        updatedAt: j.updatedAt,
      })),
      quotes: quotes.map(q => ({
        id: q.id,
        quoteNumber: q.quoteNumber,
        clientId: q.clientId,
        clientCompany: q.clientCompany,
        contactName: q.contactName,
        address: q.address,
        description: q.description,
        quoteValue: q.quoteValue,
        vatRate: q.vatRate,
        quoteDate: q.quoteDate,
        expiryDate: q.expiryDate,
        status: q.status,
        notes: q.notes,
        createdBy: q.createdBy,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
      })),
    },
  }

  return pack
}

export function logicalBackupFilename(exportedAt = new Date()): string {
  return `oryx-data-backup-${format(exportedAt, "yyyy-MM-dd_HH-mm")}.json`
}
