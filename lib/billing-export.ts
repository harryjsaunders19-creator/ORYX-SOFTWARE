import * as XLSX from "xlsx"
import type { AccountsHandoverSnapshot } from "@/lib/db"

/**
 * Builds the Accounts Handover workbook matching the company's standard
 * template layout exactly. Single sheet named by export year, columns:
 *
 *   A: (empty spacer)
 *   B: Drawing Number
 *   C: (empty spacer)
 *   D: Site Address
 *   E: Type of works
 *   F: Client Company
 *   G: Quote                    (£ currency format)
 *   H: Requested By
 *   I: Date completed
 *   J: Designer completed by
 *
 * Used both at export time (fresh snapshots) and when re-downloading a
 * past batch (snapshots loaded from BillingExportSnapshot).
 */
export function buildAccountsHandoverWorkbook(
  snapshots: AccountsHandoverSnapshot[],
  meta: { batchNumber: string; exportDate: string; exportedBy: string },
) {
  const wb = XLSX.utils.book_new()

  const sheetYear = meta.exportDate.slice(0, 4)

  // Header row — column A and C are intentional spacers matching the template
  const header: (string | null)[] = [
    null,                      // A: spacer
    "Drawing Number",          // B
    null,                      // C: spacer
    "Site Address",            // D
    "Type of works",           // E
    "Client Company",          // F
    "Quote",                   // G
    "Requested By",            // H
    "Date completed",          // I
    "Designer completed by",   // J
  ]

  const dataRows = snapshots.map(s => {
    const typeOfWorks = s.project.typeOfWorks === "Other"
      ? (s.project.otherTypeDescription ?? "Other")
      : (s.project.typeOfWorks ?? "")

    return [
      null,                                              // A: spacer
      s.project.drawingNumber,                           // B
      null,                                              // C: spacer
      s.project.siteAddress,                             // D
      typeOfWorks,                                       // E
      s.client.clientName,                               // F
      s.commercial.agreedFee ?? s.commercial.quotedFee,  // G: number or null
      s.request.requestedBy ?? "",                       // H
      s.project.completionDate || "",                    // I
      s.design.assignedDesigner ?? "",                   // J
    ]
  })

  const sheet = XLSX.utils.aoa_to_sheet([header, ...dataRows])

  // ── Column widths matching the template's visual proportions ────
  sheet["!cols"] = [
    { wch: 2 },    // A: narrow spacer
    { wch: 22 },   // B: Drawing Number
    { wch: 2 },    // C: narrow spacer
    { wch: 40 },   // D: Site Address (wide)
    { wch: 28 },   // E: Type of works
    { wch: 28 },   // F: Client Company
    { wch: 14 },   // G: Quote
    { wch: 20 },   // H: Requested By
    { wch: 16 },   // I: Date completed
    { wch: 24 },   // J: Designer completed by
  ]

  // ── Number format: Quote column (G) as £ currency ──────────────
  // Template uses "£"#,##0.00 for the Quote column. SheetJS community
  // edition doesn't support cell styles, but it does honour the `z`
  // (number format) property on individual cells.
  for (let r = 1; r <= dataRows.length; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: 6 }) // column G
    const cell = sheet[addr]
    if (cell && cell.t === "n") {
      cell.z = "\"£\"#,##0.00"
    }
  }

  XLSX.utils.book_append_sheet(wb, sheet, sheetYear)

  return wb
}

export function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
}
