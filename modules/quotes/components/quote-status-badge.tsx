"use client"
import { format } from "date-fns"
import { cn, parseLocalDate, getQuoteExpiryInfo, quoteExpiryBadgeClass } from "@/shared/utils/utils"
import { QUOTE_STATUSES } from "@/lib/types"
import type { Quote } from "@/lib/types"

export function statusMeta(status: string) {
  return QUOTE_STATUSES.find(s => s.value === status) ?? QUOTE_STATUSES[0]
}

export function QuoteStatusBadge({ status }: { status: string }) {
  const s = statusMeta(status)
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2.5 py-0.5 type-badge whitespace-nowrap",
      s.color,
    )}>
      {s.label}
    </span>
  )
}

export function QuoteExpiryCell({ quote }: { quote: Quote }) {
  const info = getQuoteExpiryInfo(quote.expiryDate, quote.status)
  if (!quote.expiryDate) {
    return <span className="text-xs text-t4">—</span>
  }
  return (
    <div className="space-y-1">
      <p className="text-xs text-t3 tabular-nums">
        {format(parseLocalDate(quote.expiryDate), "d MMM yyyy")}
      </p>
      {info.severity !== "none" && (
        <span className={cn(
          "inline-flex type-badge px-1.5 py-0.5 rounded-full",
          quoteExpiryBadgeClass(info.severity),
        )}>
          {info.label}
        </span>
      )}
    </div>
  )
}
