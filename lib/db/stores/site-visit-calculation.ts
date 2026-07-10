/** SQLite access for saved site visit calculations. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import type {
  CreateSiteVisitCalculationData,
  SiteVisitCalculationRow,
} from "../site-visit-types"

export type { SiteVisitCalculationRow, CreateSiteVisitCalculationData } from "../site-visit-types"

export const siteVisitCalculationDb = {
  findMany(): SiteVisitCalculationRow[] {
    return db.prepare(
      "SELECT * FROM SiteVisitCalculation ORDER BY createdAt DESC",
    ).all() as SiteVisitCalculationRow[]
  },

  findUnique(id: string): SiteVisitCalculationRow | null {
    return (db.prepare(
      "SELECT * FROM SiteVisitCalculation WHERE id = ?",
    ).get(id) as SiteVisitCalculationRow) ?? null
  },

  create(data: CreateSiteVisitCalculationData): SiteVisitCalculationRow {
    const now = nowIso()
    db.prepare(`
      INSERT INTO SiteVisitCalculation (
        id, label, createdBy, createdByName, siteAddress, siteLat, siteLng,
        oneWayDistanceMiles, oneWayDurationMinutes, siteHours,
        mileageRate, hourlyRate, vatRate,
        mileageCost, labourCost, subtotal, vat, grandTotal,
        createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id, data.label, data.createdBy, data.createdByName,
      data.siteAddress, data.siteLat, data.siteLng,
      data.oneWayDistanceMiles, data.oneWayDurationMinutes, data.siteHours,
      data.mileageRate, data.hourlyRate, data.vatRate,
      data.mileageCost, data.labourCost, data.subtotal, data.vat, data.grandTotal,
      now, now,
    )
    return this.findUnique(data.id)!
  },

  delete(id: string): boolean {
    return db.prepare("DELETE FROM SiteVisitCalculation WHERE id = ?").run(id).changes > 0
  },
}
