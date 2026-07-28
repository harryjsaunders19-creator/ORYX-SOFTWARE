import { NextResponse } from "next/server"
import { requireModuleAccess } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { ORYX_OFFICE } from "../constants"
import { savedCalculationService } from "../services/saved-service"
import { buildCalculationResult } from "../services/calculator-math"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const auth = await requireModuleAccess("site-visit-calculator")
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const item = await savedCalculationService.findUnique(id)
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const result = buildCalculationResult({
      officeAddress: ORYX_OFFICE.addressLine,
      siteAddress: item.siteAddress,
      siteLat: item.siteLat,
      siteLng: item.siteLng,
      siteHours: item.siteHours,
      route: {
        oneWayDistanceMiles: item.oneWayDistanceMiles,
        oneWayDurationMinutes: item.oneWayDurationMinutes,
      },
      rates: {
        mileagePerMile: item.mileageRate,
        hourlyRate: item.hourlyRate,
        vatRate: item.vatRate,
      },
    })

    return NextResponse.json({ item, result })
  } catch (err) {
    return apiInternalError("site-visit-calculator.api.saved.get", err)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const auth = await requireModuleAccess("site-visit-calculator")
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const existing = await savedCalculationService.findUnique(id)
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (auth.user.role !== "ADMIN" && existing.createdBy !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await savedCalculationService.delete(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiInternalError("site-visit-calculator.api.saved.delete", err)
  }
}
