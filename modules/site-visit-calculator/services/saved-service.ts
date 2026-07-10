import { createId } from "@paralleldrive/cuid2"
import { siteVisitCalculationDb } from "@/lib/db/stores/site-visit-calculation"
import type { SiteVisitCalculationRow } from "@/lib/db/site-visit-types"
import { useSupabaseSiteVisitCalculations, isSupabaseOnly } from "@/lib/supabase/feature-flags"
import { supabaseSiteVisitCalcRepo } from "../supabase/repository"
import type { SavedSiteVisitCalculation, SaveSiteVisitInput } from "../types"

function toSaved(row: SiteVisitCalculationRow): SavedSiteVisitCalculation {
  return {
    id: row.id,
    label: row.label,
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    siteAddress: row.siteAddress,
    siteLat: row.siteLat,
    siteLng: row.siteLng,
    oneWayDistanceMiles: row.oneWayDistanceMiles,
    oneWayDurationMinutes: row.oneWayDurationMinutes,
    siteHours: row.siteHours,
    mileageRate: row.mileageRate,
    hourlyRate: row.hourlyRate,
    vatRate: row.vatRate,
    mileageCost: row.mileageCost,
    labourCost: row.labourCost,
    subtotal: row.subtotal,
    vat: row.vat,
    grandTotal: row.grandTotal,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function findManyRows(): Promise<SiteVisitCalculationRow[]> {
  if (useSupabaseSiteVisitCalculations()) return supabaseSiteVisitCalcRepo.findMany()
  return siteVisitCalculationDb.findMany()
}

async function findUniqueRow(id: string): Promise<SiteVisitCalculationRow | null> {
  if (useSupabaseSiteVisitCalculations()) return supabaseSiteVisitCalcRepo.findUnique(id)
  return siteVisitCalculationDb.findUnique(id)
}

export const savedCalculationService = {
  async findMany(): Promise<SavedSiteVisitCalculation[]> {
    const rows = await findManyRows()
    return rows.map(toSaved)
  },

  async findUnique(id: string): Promise<SavedSiteVisitCalculation | null> {
    const row = await findUniqueRow(id)
    return row ? toSaved(row) : null
  },

  async create(
    input: SaveSiteVisitInput,
    createdBy: string,
    createdByName: string,
  ): Promise<SavedSiteVisitCalculation> {
    const r = input.result
    const data = {
      id: createId(),
      label: input.label?.trim() || null,
      createdBy,
      createdByName,
      siteAddress: r.siteAddress,
      siteLat: r.siteLat,
      siteLng: r.siteLng,
      oneWayDistanceMiles: r.oneWayDistanceMiles,
      oneWayDurationMinutes: r.oneWayDurationMinutes,
      siteHours: r.siteHours,
      mileageRate: r.rates.mileagePerMile,
      hourlyRate: r.rates.hourlyRate,
      vatRate: r.rates.vatRate,
      mileageCost: r.mileageCost,
      labourCost: r.labourCost,
      subtotal: r.subtotal,
      vat: r.vat,
      grandTotal: r.grandTotal,
    }

    if (isSupabaseOnly() || useSupabaseSiteVisitCalculations()) {
      const now = new Date().toISOString()
      const row: SiteVisitCalculationRow = { ...data, createdAt: now, updatedAt: now }
      await supabaseSiteVisitCalcRepo.upsert(row)
      if (!isSupabaseOnly()) siteVisitCalculationDb.create(data)
      return toSaved(row)
    }

    const row = siteVisitCalculationDb.create(data)
    return toSaved(row)
  },

  async delete(id: string): Promise<boolean> {
    if (useSupabaseSiteVisitCalculations()) {
      await supabaseSiteVisitCalcRepo.delete(id)
      if (!isSupabaseOnly()) siteVisitCalculationDb.delete(id)
      return true
    }
    return siteVisitCalculationDb.delete(id)
  },
}
