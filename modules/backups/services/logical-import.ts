/**
 * Import a logical backup pack produced by buildLogicalBackupPack().
 * Upserts Users → Clients → Jobs → Quotes so jobs can relink to clients
 * and performance attribution (Users + designer) is restored.
 */
import { createId } from "@paralleldrive/cuid2"
import { hashPassword, generateTempPassword } from "@/lib/password"
import { userService } from "@/lib/services/user-service"
import { clientService } from "@/lib/services/client-service"
import { jobService } from "@/lib/services/job-service"
import { quoteService } from "@/lib/services/quote-service"
import {
  buildClientRowFromImport,
  buildJobRowFromImport,
  buildQuoteRowFromImport,
  bulkImportClients,
  bulkImportJobs,
  bulkImportQuotes,
  formatImportError,
} from "@/modules/import-export/services/import-excel-bulk"
import {
  useSupabaseClients,
  useSupabaseJobs,
  useSupabaseQuotes,
} from "@/lib/supabase/feature-flags"
import { MAX_IMPORT_LOOKUP_ROWS } from "@/modules/import-export/constants"
import {
  LOGICAL_BACKUP_VERSION,
  type LogicalBackupPack,
} from "./logical-export"
import { logicalBackupPackSchema } from "./logical-backup-schema"

export type LogicalSheetResult = {
  created: number
  updated: number
  skipped: number
  errors: string[]
}

export type LogicalImportResult = {
  users: LogicalSheetResult
  clients: LogicalSheetResult
  jobs: LogicalSheetResult
  quotes: LogicalSheetResult
}

function emptyResult(): LogicalSheetResult {
  return { created: 0, updated: 0, skipped: 0, errors: [] }
}

async function importUsers(
  rows: LogicalBackupPack["tables"]["users"],
): Promise<LogicalSheetResult> {
  const result = emptyResult()
  if (!Array.isArray(rows) || !rows.length) return result

  let existing: Awaited<ReturnType<typeof userService.findMany>>
  try {
    existing = await userService.findMany()
  } catch (err) {
    result.errors.push(`Could not load users: ${formatImportError(err)}`)
    return result
  }

  const byId = new Map(existing.map(u => [u.id, u]))
  const byEmail = new Map(
    existing
      .filter(u => u.emailLower)
      .map(u => [u.emailLower!, u]),
  )

  for (const row of rows) {
    const name = typeof row.name === "string" ? row.name.trim() : ""
    if (!name) {
      result.skipped++
      continue
    }
    const email = typeof row.email === "string" && row.email.trim()
      ? row.email.trim().toLowerCase()
      : null
    const role = row.role === "ADMIN" ? "ADMIN" : "ENGINEER"
    const active = row.active === 0 ? 0 : 1
    const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : createId()

    const matched = byId.get(id) ?? (email ? byEmail.get(email) : undefined)

    let passwordHash =
      typeof row.passwordHash === "string" && row.passwordHash.trim()
        ? row.passwordHash.trim()
        : null
    let mustChangePassword =
      row.mustChangePassword === 1 || row.mustChangePassword === 0
        ? row.mustChangePassword
        : matched?.mustChangePassword ?? 0

    if (!passwordHash && !matched?.passwordHash) {
      passwordHash = hashPassword(generateTempPassword())
      mustChangePassword = 1
    }

    try {
      if (matched) {
        await userService.update(matched.id, {
          name,
          email,
          role,
          active,
          passwordHash: passwordHash ?? undefined,
          mustChangePassword,
        })
        result.updated++
      } else {
        await userService.create({
          id,
          name,
          email,
          role,
          passwordHash,
          mustChangePassword,
        })
        if (active === 0) {
          await userService.update(id, { active: 0 })
        }
        result.created++
      }
    } catch (err) {
      result.errors.push(`User "${name}": ${formatImportError(err)}`)
      result.skipped++
    }
  }

  return result
}

async function importClients(
  rows: LogicalBackupPack["tables"]["clients"],
): Promise<LogicalSheetResult> {
  const result = emptyResult()
  if (!Array.isArray(rows) || !rows.length) return result

  let allClients: Awaited<ReturnType<typeof clientService.findManyWithMeta>>
  try {
    allClients = await clientService.findManyWithMeta({ take: MAX_IMPORT_LOOKUP_ROWS })
  } catch (err) {
    result.errors.push(`Could not load clients: ${formatImportError(err)}`)
    return result
  }

  const byId = new Map(allClients.map(c => [c.id, c]))
  const byAccount = new Map(
    allClients.filter(c => c.accountCode).map(c => [c.accountCode!, c]),
  )
  const byName = new Map(allClients.map(c => [c.name.toLowerCase(), c]))

  const toUpsert = []
  let createCount = 0
  let updateCount = 0

  for (const row of rows) {
    const name = typeof row.name === "string" ? row.name.trim() : ""
    if (!name) {
      result.skipped++
      continue
    }
    const accountCode =
      typeof row.accountCode === "string" && row.accountCode.trim()
        ? row.accountCode.trim()
        : null
    const matched =
      (typeof row.id === "string" ? byId.get(row.id) : undefined) ??
      (accountCode ? byAccount.get(accountCode) : undefined) ??
      byName.get(name.toLowerCase())

    if (matched) updateCount++
    else createCount++

    toUpsert.push(
      buildClientRowFromImport({
        id: matched?.id ?? (typeof row.id === "string" && row.id ? row.id : createId()),
        name,
        contactName: row.contactName ?? null,
        phone: row.phone ?? null,
        email: row.email ?? null,
        billingAddress: row.billingAddress ?? null,
        notes: row.notes ?? null,
        accountCode,
        active: row.active === 0 ? 0 : 1,
      }),
    )
  }

  if (!toUpsert.length) return result

  if (useSupabaseClients()) {
    try {
      await bulkImportClients(toUpsert)
      result.created = createCount
      result.updated = updateCount
    } catch (err) {
      result.errors.push(`Bulk client import: ${formatImportError(err)}`)
      result.skipped += createCount + updateCount
    }
    return result
  }

  for (const client of toUpsert) {
    const existing = byId.get(client.id) ?? byName.get(client.name.toLowerCase())
    try {
      if (existing) {
        await clientService.update(existing.id, {
          name: client.name,
          contactName: client.contactName,
          phone: client.phone,
          email: client.email,
          billingAddress: client.billingAddress,
          notes: client.notes,
          accountCode: client.accountCode,
          active: client.active,
        })
        result.updated++
      } else {
        await clientService.create({
          id: client.id,
          name: client.name,
          contactName: client.contactName,
          phone: client.phone,
          email: client.email,
          billingAddress: client.billingAddress,
          notes: client.notes,
          accountCode: client.accountCode,
        })
        result.created++
      }
    } catch (err) {
      result.errors.push(`Client "${client.name}": ${formatImportError(err)}`)
      result.skipped++
    }
  }

  return result
}

async function importJobs(
  rows: LogicalBackupPack["tables"]["jobs"],
): Promise<LogicalSheetResult> {
  const result = emptyResult()
  if (!Array.isArray(rows) || !rows.length) return result

  let allJobs: Awaited<ReturnType<typeof jobService.findMany>>
  try {
    allJobs = await jobService.findMany({ take: MAX_IMPORT_LOOKUP_ROWS })
  } catch (err) {
    result.errors.push(`Could not load jobs: ${formatImportError(err)}`)
    return result
  }
  const byDrawing = new Map(allJobs.map(j => [j.drawingNumber.toUpperCase(), j]))
  const byId = new Map(allJobs.map(j => [j.id, j]))

  let allClients: Awaited<ReturnType<typeof clientService.findManyWithMeta>>
  try {
    allClients = await clientService.findManyWithMeta({ take: MAX_IMPORT_LOOKUP_ROWS })
  } catch (err) {
    result.errors.push(`Could not load clients for job linking: ${formatImportError(err)}`)
    return result
  }
  const clientByName = new Map(allClients.map(c => [c.name.toLowerCase(), c]))
  const clientById = new Map(allClients.map(c => [c.id, c]))

  const built = []
  let createCount = 0
  let updateCount = 0

  for (const row of rows) {
    const drawingNumber =
      typeof row.drawingNumber === "string" ? row.drawingNumber.trim() : ""
    if (!drawingNumber) {
      result.skipped++
      continue
    }
    const existing =
      (typeof row.id === "string" ? byId.get(row.id) : undefined) ??
      byDrawing.get(drawingNumber.toUpperCase())

    const clientCompany =
      typeof row.clientCompany === "string" ? row.clientCompany : ""
    const clientId =
      (typeof row.clientId === "string" && clientById.has(row.clientId)
        ? row.clientId
        : null) ??
      clientByName.get(clientCompany.toLowerCase())?.id ??
      null

    if (existing) updateCount++
    else createCount++

    const job = buildJobRowFromImport({
      id: existing?.id ?? (typeof row.id === "string" && row.id ? row.id : createId()),
      drawingNumber,
      itemType: row.itemType || "DESIGN",
      address: row.address || existing?.address || "",
      typeOfWorks: row.typeOfWorks || "Other",
      clientCompany,
      clientId,
      requestedBy: row.requestedBy || "",
      status: row.status || "NEW_REQUEST",
      designer: row.designer || "",
      quoteValue: row.quoteValue ?? null,
      variationFees: row.variationFees ?? null,
      quoteReference: row.quoteReference ?? null,
      requiredByDate: row.requiredByDate ?? null,
      dateCreated: row.dateCreated ?? null,
      dateCompleted: row.dateCompleted ?? null,
      notes: row.notes ?? null,
    })
    if (row.customTypeDescription) job.customTypeDescription = row.customTypeDescription
    if (row.parentJobId) job.parentJobId = row.parentJobId
    if (row.revisionLetter) job.revisionLetter = row.revisionLetter
    built.push(job)
  }

  // Resolve parent links by drawing number for revisions in the same pack.
  const packByDrawing = new Map(built.map(j => [j.drawingNumber.toUpperCase(), j]))
  for (const job of built) {
    const m = job.drawingNumber.match(/^(.+) Rev ([A-Z])$/)
    if (!m) continue
    const parent =
      packByDrawing.get(m[1].toUpperCase()) ?? byDrawing.get(m[1].toUpperCase())
    if (!parent) continue
    job.parentJobId = parent.id
    job.revisionLetter = m[2]
    job.itemType = "REVISION"
  }

  if (!built.length) return result

  if (useSupabaseJobs()) {
    try {
      await bulkImportJobs(built)
      result.created = createCount
      result.updated = updateCount
    } catch (err) {
      result.errors.push(`Bulk job import: ${formatImportError(err)}`)
      result.skipped += createCount + updateCount
    }
    return result
  }

  for (const job of built) {
    const existing = byDrawing.get(job.drawingNumber.toUpperCase())
    try {
      if (existing) {
        await jobService.update(existing.id, {
          address: job.address,
          typeOfWorks: job.typeOfWorks,
          customTypeDescription: job.customTypeDescription,
          clientCompany: job.clientCompany,
          clientId: job.clientId,
          requestedBy: job.requestedBy,
          status: job.status,
          designer: job.designer,
          quoteValue: job.quoteValue,
          variationFees: job.variationFees,
          quoteReference: job.quoteReference,
          requiredByDate: job.requiredByDate,
          dateCompleted: job.dateCompleted,
          notes: job.notes,
          changedBy: "JSON Backup Import",
        })
        result.updated++
      } else {
        await jobService.create({
          id: job.id,
          drawingNumber: job.drawingNumber,
          itemType: job.itemType,
          address: job.address,
          typeOfWorks: job.typeOfWorks,
          customTypeDescription: job.customTypeDescription,
          clientCompany: job.clientCompany,
          clientId: job.clientId,
          requestedBy: job.requestedBy,
          status: job.status,
          designer: job.designer,
          quoteValue: job.quoteValue,
          variationFees: job.variationFees,
          quoteReference: job.quoteReference,
          dateCompleted: job.dateCompleted,
          notes: job.notes,
          requiredByDate: job.requiredByDate,
          changedBy: "JSON Backup Import",
        })
        result.created++
      }
    } catch (err) {
      result.errors.push(`Job "${job.drawingNumber}": ${formatImportError(err)}`)
      result.skipped++
    }
  }

  return result
}

async function importQuotes(
  rows: LogicalBackupPack["tables"]["quotes"],
): Promise<LogicalSheetResult> {
  const result = emptyResult()
  if (!Array.isArray(rows) || !rows.length) return result

  let allQuotes: Awaited<ReturnType<typeof quoteService.findMany>>
  try {
    allQuotes = await quoteService.findMany({ take: MAX_IMPORT_LOOKUP_ROWS })
  } catch (err) {
    result.errors.push(`Could not load quotes: ${formatImportError(err)}`)
    return result
  }
  const byNumber = new Map(allQuotes.map(q => [q.quoteNumber, q]))

  let allClients: Awaited<ReturnType<typeof clientService.findManyWithMeta>>
  try {
    allClients = await clientService.findManyWithMeta({ take: MAX_IMPORT_LOOKUP_ROWS })
  } catch (err) {
    result.errors.push(`Could not load clients for quote linking: ${formatImportError(err)}`)
    return result
  }
  const clientByName = new Map(allClients.map(c => [c.name.toLowerCase(), c]))
  const clientById = new Map(allClients.map(c => [c.id, c]))

  const built = []
  let createCount = 0
  let updateCount = 0

  for (const row of rows) {
    const quoteNumber =
      typeof row.quoteNumber === "string" ? row.quoteNumber.trim() : ""
    if (!quoteNumber) {
      result.skipped++
      continue
    }
    const existing = byNumber.get(quoteNumber)
    const clientCompany =
      typeof row.clientCompany === "string" ? row.clientCompany : ""
    const clientId =
      (typeof row.clientId === "string" && clientById.has(row.clientId)
        ? row.clientId
        : null) ??
      clientByName.get(clientCompany.toLowerCase())?.id ??
      null

    if (existing) updateCount++
    else createCount++

    built.push(
      buildQuoteRowFromImport({
        id: existing?.id ?? (typeof row.id === "string" && row.id ? row.id : createId()),
        quoteNumber,
        clientId,
        clientCompany,
        contactName: row.contactName ?? null,
        address: row.address || "",
        description: row.description || "",
        quoteValue: row.quoteValue ?? 0,
        quoteDate: row.quoteDate || new Date().toISOString(),
        expiryDate: row.expiryDate ?? null,
        status: row.status || "DRAFT",
        notes: row.notes ?? null,
        createdBy: row.createdBy || "JSON Backup Import",
        vatRate: row.vatRate ?? null,
      }),
    )
  }

  if (!built.length) return result

  if (useSupabaseQuotes()) {
    try {
      await bulkImportQuotes(built)
      result.created = createCount
      result.updated = updateCount
    } catch (err) {
      result.errors.push(`Bulk quote import: ${formatImportError(err)}`)
      result.skipped += createCount + updateCount
    }
    return result
  }

  for (const quote of built) {
    const existing = byNumber.get(quote.quoteNumber)
    try {
      if (existing) {
        await quoteService.update(existing.id, {
          clientId: quote.clientId,
          clientCompany: quote.clientCompany,
          contactName: quote.contactName,
          address: quote.address,
          description: quote.description,
          quoteValue: quote.quoteValue,
          vatRate: quote.vatRate,
          quoteDate: quote.quoteDate,
          expiryDate: quote.expiryDate,
          status: quote.status,
          notes: quote.notes,
        })
        result.updated++
      } else {
        await quoteService.create({
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          clientId: quote.clientId,
          clientCompany: quote.clientCompany,
          contactName: quote.contactName,
          address: quote.address,
          description: quote.description,
          quoteValue: quote.quoteValue,
          vatRate: quote.vatRate,
          quoteDate: quote.quoteDate,
          expiryDate: quote.expiryDate,
          status: quote.status,
          notes: quote.notes,
          createdBy: quote.createdBy,
        })
        result.created++
      }
    } catch (err) {
      result.errors.push(`Quote "${quote.quoteNumber}": ${formatImportError(err)}`)
      result.skipped++
    }
  }

  return result
}

export async function importLogicalBackupPack(
  raw: unknown,
): Promise<LogicalImportResult> {
  const parsed = logicalBackupPackSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(
      "Invalid backup file. Expected an Oryx logical backup JSON (Export full data).",
    )
  }
  const pack = parsed.data as LogicalBackupPack
  if (pack.version > LOGICAL_BACKUP_VERSION) {
    throw new Error(
      `This backup format (v${pack.version}) is newer than the app supports (v${LOGICAL_BACKUP_VERSION}).`,
    )
  }

  const users = await importUsers(pack.tables.users ?? [])
  const clients = await importClients(pack.tables.clients ?? [])
  const jobs = await importJobs(pack.tables.jobs ?? [])
  const quotes = await importQuotes(pack.tables.quotes ?? [])

  return { users, clients, jobs, quotes }
}
