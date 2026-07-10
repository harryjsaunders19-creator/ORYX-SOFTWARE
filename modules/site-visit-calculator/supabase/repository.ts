import { createAdminClient } from "@/lib/supabase/admin"
import type { SiteVisitCalculationRow } from "@/lib/db/site-visit-types"

interface SupabaseSiteVisitRow {
  id: string
  label: string | null
  created_by: string
  created_by_name: string | null
  site_address: string
  site_lat: number | null
  site_lng: number | null
  one_way_distance_miles: number
  one_way_duration_minutes: number
  site_hours: number
  mileage_rate: number
  hourly_rate: number
  vat_rate: number
  mileage_cost: number
  labour_cost: number
  subtotal: number
  vat: number
  grand_total: number
  created_at: string
  updated_at: string
}

function toRow(row: SupabaseSiteVisitRow): SiteVisitCalculationRow {
  return {
    id: row.id,
    label: row.label,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    siteAddress: row.site_address,
    siteLat: row.site_lat,
    siteLng: row.site_lng,
    oneWayDistanceMiles: Number(row.one_way_distance_miles),
    oneWayDurationMinutes: Number(row.one_way_duration_minutes),
    siteHours: Number(row.site_hours),
    mileageRate: Number(row.mileage_rate),
    hourlyRate: Number(row.hourly_rate),
    vatRate: Number(row.vat_rate),
    mileageCost: Number(row.mileage_cost),
    labourCost: Number(row.labour_cost),
    subtotal: Number(row.subtotal),
    vat: Number(row.vat),
    grandTotal: Number(row.grand_total),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toSupabaseRow(row: SiteVisitCalculationRow): SupabaseSiteVisitRow {
  return {
    id: row.id,
    label: row.label,
    created_by: row.createdBy,
    created_by_name: row.createdByName,
    site_address: row.siteAddress,
    site_lat: row.siteLat,
    site_lng: row.siteLng,
    one_way_distance_miles: row.oneWayDistanceMiles,
    one_way_duration_minutes: row.oneWayDurationMinutes,
    site_hours: row.siteHours,
    mileage_rate: row.mileageRate,
    hourly_rate: row.hourlyRate,
    vat_rate: row.vatRate,
    mileage_cost: row.mileageCost,
    labour_cost: row.labourCost,
    subtotal: row.subtotal,
    vat: row.vat,
    grand_total: row.grandTotal,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

function table() {
  return createAdminClient().from("site_visit_calculations")
}

export const supabaseSiteVisitCalcRepo = {
  async findMany(): Promise<SiteVisitCalculationRow[]> {
    const { data, error } = await table()
      .select("*")
      .order("created_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map(toRow)
  },

  async findUnique(id: string): Promise<SiteVisitCalculationRow | null> {
    const { data, error } = await table().select("*").eq("id", id).maybeSingle()
    if (error) throw error
    return data ? toRow(data) : null
  },

  async upsert(row: SiteVisitCalculationRow): Promise<void> {
    const { error } = await table().upsert(toSupabaseRow(row), { onConflict: "id" })
    if (error) throw error
  },

  async delete(id: string): Promise<void> {
    const { error } = await table().delete().eq("id", id)
    if (error) throw error
  },
}
