"use client"
import { memo } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { formatGBP, parseLocalDate } from "@/shared/utils/utils"
import { quoteWorksDisplayLabel } from "../quote-works"
import type { Quote } from "@/lib/types"
import { QuoteStatusBadge, QuoteExpiryCell } from "./quote-status-badge"
import { QuoteRowActions } from "./quotes-table-row"

export const QuoteMobileCard = memo(function QuoteMobileCard({
  quote: q,
  isPdfBusy,
  onGeneratePdf,
  onEdit,
  onSetStatus,
  onConvert,
  onArchive,
  onLinkJob,
}: {
  quote: Quote
  isPdfBusy: boolean
  onGeneratePdf: (q: Quote) => void
  onEdit: (q: Quote) => void
  onSetStatus: (q: Quote, status: string) => void
  onConvert: (q: Quote) => void
  onArchive: (q: Quote) => void
  onLinkJob?: (q: Quote) => void
}) {
  return (
    <div className="rounded-xl border border-bd bg-sr shadow-card p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="type-drawing-number type-badge text-ac">{q.quoteNumber}</span>
          <p className="text-sm font-medium text-t1 mt-1 truncate">{q.clientCompany}</p>
          {q.contactName && <p className="text-xs text-t3 truncate">{q.contactName}</p>}
          <p className="text-xs text-t2 mt-1 line-clamp-2">
            {quoteWorksDisplayLabel(q.typeOfWorks, q.customTypeDescription, q.description)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold tabular-nums text-t1">{formatGBP(q.quoteValue)}</p>
          {q.vatRate != null && <p className="type-helper text-t4">+{q.vatRate}% VAT</p>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-t3">
        <span className="tabular-nums">{format(parseLocalDate(q.quoteDate), "d MMM yyyy")}</span>
        <QuoteExpiryCell quote={q} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <QuoteStatusBadge status={q.status} />
        {q.jobId && (
          <Link href={`/jobs/${q.jobId}`} prefetch={false} className="type-helper text-ac hover:underline">
            View job →
          </Link>
        )}
      </div>

      <div className="pt-2 border-t border-bd/60">
        <QuoteRowActions
          quote={q}
          isPdfBusy={isPdfBusy}
          onGeneratePdf={onGeneratePdf}
          onEdit={onEdit}
          onSetStatus={onSetStatus}
          onConvert={onConvert}
          onArchive={onArchive}
          onLinkJob={onLinkJob}
        />
      </div>
    </div>
  )
})
