import { NextResponse } from "next/server"
import { requireSignIn } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { savedCalculationService } from "../services/saved-service"
import { computeBillableLabourHours, roundMoney } from "../services/calculator-math"
import type { SiteVisitCalculationResult } from "../types"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const item = await savedCalculationService.findUnique(id)
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const billing = computeBillableLabourHours(
      item.oneWayDurationMinutes,
      item.siteHours,
    )

    const result: SiteVisitCalculationResult = {
      officeAddress: "Little Woodlands, 61 Bath Road, Willsbridge, Bristol, BS30 6ES",
      siteAddress: item.siteAddress,
      siteLat: item.siteLat,
      siteLng: item.siteLng,
      oneWayDistanceMiles: item.oneWayDistanceMiles,
      returnDistanceMiles: Math.round(item.oneWayDistanceMiles * 2 * 100) / 100,
      oneWayDurationMinutes: item.oneWayDurationMinutes,
      returnDurationMinutes: Math.round(item.oneWayDurationMinutes * 2 * 10) / 10,
      siteHours: item.siteHours,
      returnBillableDriveHours: billing.returnBillableDriveHours,
      billableSiteHours: billing.billableSiteHours,
      billableLabourHours: billing.billableLabourHours,
      rates: {
        mileagePerMile: item.mileageRate,
        hourlyRate: item.hourlyRate,
        vatRate: item.vatRate,
      },
      mileageCost: item.mileageCost,
      labourCost: roundMoney(billing.billableLabourHours * item.hourlyRate),
      subtotal: roundMoney(
        item.mileageCost + billing.billableLabourHours * item.hourlyRate,
      ),
      vat: roundMoney(
        (item.mileageCost + billing.billableLabourHours * item.hourlyRate) * item.vatRate,
      ),
      grandTotal: roundMoney(
        (item.mileageCost + billing.billableLabourHours * item.hourlyRate) * (1 + item.vatRate),
      ),
    }

    return NextResponse.json({ item, result })
  } catch (err) {
    return apiInternalError("site-visit-calculator.api.saved.get", err)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const existing = await savedCalculationService.findUnique(id)
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    await savedCalculationService.delete(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiInternalError("site-visit-calculator.api.saved.delete", err)
  }
}
