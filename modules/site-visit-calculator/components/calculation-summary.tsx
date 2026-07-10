"use client"

import { formatGBP } from "@/shared/utils/utils"
import type { SiteVisitCalculationResult } from "../types"
import { DAY_RATE_DRIVE_THRESHOLD_HOURS } from "../constants"
import { DataPanel } from "@/shared/layouts/page-layout"
import { Building2, MapPin, PoundSterling } from "lucide-react"

function fmtMiles(m: number): string {
  return `${m.toFixed(2)} mi`
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hr`
  return `${h} hr ${m} min`
}

interface CalculationSummaryProps {
  result: SiteVisitCalculationResult | null
  loading?: boolean
  error?: string | null
  printId?: string
}

export function CalculationSummary({
  result,
  loading,
  error,
  printId = "site-visit-summary",
}: CalculationSummaryProps) {
  if (error) {
    return (
      <DataPanel className="p-6">
        <p className="text-sm text-danger">{error}</p>
      </DataPanel>
    )
  }

  if (loading) {
    return (
      <DataPanel className="p-6">
        <p className="text-sm text-t3">Calculating route and costs…</p>
      </DataPanel>
    )
  }

  if (!result) {
    return (
      <DataPanel className="p-6">
        <p className="text-sm text-t3">
          Enter a site address to see the cost estimate.
        </p>
      </DataPanel>
    )
  }

  return (
    <div id={printId}>
    <DataPanel className="p-6 space-y-6 print:border-0 print:shadow-none">
      <div>
        <h2 className="text-sm font-semibold text-t1 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-ac" />
          Summary
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="text-t3">Office</dt>
            <dd className="text-t1">{result.officeAddress}</dd>
          </div>
          <div>
            <dt className="text-t3 flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> Site
            </dt>
            <dd className="text-t1">{result.siteAddress}</dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1 text-sm">
        <Stat label="One-way distance" value={fmtMiles(result.oneWayDistanceMiles)} />
        <Stat label="Return distance" value={fmtMiles(result.returnDistanceMiles)} />
        <Stat label="One-way drive" value={fmtDuration(result.oneWayDurationMinutes)} />
        <Stat label="Return drive" value={fmtDuration(result.returnDurationMinutes)} />
        <Stat label="Time on site" value={`${result.siteHours} hr`} />
        <Stat
          label="Labour billed"
          value={
            result.isDayRate
              ? `Day rate ${formatGBP(result.labourCost)}`
              : `${result.billableLabourHours} hr @ ${formatGBP(result.rates.hourlyRate)}/hr`
          }
        />
      </div>

      {result.isDayRate && (
        <p className="text-xs text-t3">
          One-way drive exceeds {DAY_RATE_DRIVE_THRESHOLD_HOURS} hours — day rate applied.
        </p>
      )}

      {result.billableSiteHours > result.siteHours && !result.isDayRate && (
        <p className="text-xs text-t3">
          On-site time billed at {result.billableSiteHours} hr minimum.
        </p>
      )}

      <div className="border-t border-bd pt-4 space-y-2 text-sm">
        <Row label="Mileage" value={formatGBP(result.mileageCost)} />
        <Row
          label={result.isDayRate ? "Labour (day rate)" : `Labour (${result.billableLabourHours} hr)`}
          value={formatGBP(result.labourCost)}
        />
        {result.subtotal > result.rawSubtotal && (
          <p className="text-xs text-t3">
            Total rounded up to the nearest {formatGBP(result.rates.hourlyRate)} (ex VAT).
          </p>
        )}
        <div className="flex justify-between font-bold text-t1 text-base pt-2 border-t border-bd">
          <span>Total (ex VAT)</span>
          <span className="tabular-nums">{formatGBP(result.subtotal)}</span>
        </div>
        <Row label={`VAT (${Math.round(result.rates.vatRate * 100)}%)`} value={formatGBP(result.vat)} />
        <div className="flex justify-between font-bold text-t1 text-lg pt-1">
          <span className="flex items-center gap-1">
            <PoundSterling className="h-4 w-4" /> Total (inc VAT)
          </span>
          <span className="tabular-nums">{formatGBP(result.grandTotal)}</span>
        </div>
      </div>
    </DataPanel>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-t2">
      <span>{label}</span>
      <span className="tabular-nums text-t1">{value}</span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-bd bg-surface-low px-3 py-2">
      <p className="text-t3 text-xs">{label}</p>
      <p className="text-t1 font-medium tabular-nums mt-0.5">{value}</p>
    </div>
  )
}
