"use client"
import { memo } from "react"
import Link from "next/link"
import { format } from "date-fns"
import {
  FileDown, Download, Clock, CheckCircle2, XCircle, Archive, Loader2, Link2,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { formatGBP, parseLocalDate, getQuoteExpiryInfo } from "@/shared/utils/utils"
import { quoteWorksDisplayLabel } from "../quote-works"
import { resolveQuotePdfUrl } from "../pdf/urls"
import type { Quote } from "@/lib/types"
import { QuoteStatusBadge, QuoteExpiryCell, statusMeta } from "./quote-status-badge"

export function QuoteRowActions({ quote: q, isPdfBusy, onGeneratePdf, onEdit, onSetStatus, onConvert, onArchive, onLinkJob }: {
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
    <div className="flex items-center gap-1 justify-end flex-wrap">
      {q.pdfPath ? (
        <a href={resolveQuotePdfUrl(q.id, q.pdfPath) ?? "#"} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-t3 hover:text-ac px-1.5 py-1 rounded hover:bg-pg" title="Open PDF">
          <FileDown className="h-3.5 w-3.5" />
        </a>
      ) : (
        <button onClick={() => onGeneratePdf(q)} disabled={isPdfBusy}
          className="inline-flex items-center gap-1 text-xs text-t3 hover:text-ac px-1.5 py-1 rounded hover:bg-pg disabled:opacity-50"
          title="Generate PDF">
          {isPdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        </button>
      )}
      <Button variant="ghost" size="sm" onClick={() => onEdit(q)}>Edit</Button>
      {onLinkJob && (
        <Button variant="ghost" size="sm" onClick={() => onLinkJob(q)} title={q.jobId ? "Change linked job" : "Attach to job"}>
          <Link2 className="h-3.5 w-3.5" /> {q.jobId ? "Change job" : "Attach to job"}
        </Button>
      )}
      {q.status === "DRAFT" && (
        <Button variant="ghost" size="sm" onClick={() => onSetStatus(q, "SENT")}>
          <Clock className="h-3.5 w-3.5" /> Sent
        </Button>
      )}
      {(q.status === "DRAFT" || q.status === "SENT")
        && getQuoteExpiryInfo(q.expiryDate, q.status).severity !== "expired" && (
        <>
          <Button variant="ghost" size="sm" className="text-ok-tx hover:bg-ok-bg" onClick={() => onSetStatus(q, "ACCEPTED")}>
            <CheckCircle2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="text-dn hover:bg-dn-bg" onClick={() => onSetStatus(q, "REJECTED")}>
            <XCircle className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
      {q.status === "ACCEPTED" && !q.jobId && (
        <Button variant="primary" size="sm" onClick={() => onConvert(q)}>Create Job</Button>
      )}
      {!q.jobId && (
        <Button variant="ghost" size="sm" className="text-t4 hover:text-wn-tx hover:bg-wn-bg" title="Archive quote" onClick={() => onArchive(q)}>
          <Archive className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

function QuoteTableRow({ quote: q, isPdfBusy, onGeneratePdf, onEdit, onSetStatus, onConvert, onArchive, onLinkJob }: {
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
    <tr className="border-b border-bd last:border-0 hover:bg-pg">
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="font-mono type-badge text-ac">{q.quoteNumber}</span>
      </td>
      <td className="px-4 py-3 max-w-[140px]">
        <p className="text-xs font-medium text-t1 truncate">{q.clientCompany}</p>
        {q.contactName && <p className="text-xs text-t3 truncate">{q.contactName}</p>}
      </td>
      <td className="px-4 py-3 max-w-[220px]">
        <p className="text-xs text-t2 truncate">
          {quoteWorksDisplayLabel(q.typeOfWorks, q.customTypeDescription, q.description)}
        </p>
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <p className="text-xs font-semibold tabular-nums text-t1">{formatGBP(q.quoteValue)}</p>
        {q.vatRate != null && <p className="type-helper text-t4">+{q.vatRate}% VAT</p>}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <p className="text-xs text-t3 tabular-nums">{format(parseLocalDate(q.quoteDate), "d MMM yyyy")}</p>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <QuoteExpiryCell quote={q} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <QuoteStatusBadge status={q.status} />
        {q.jobId && (
          <Link href={`/jobs/${q.jobId}`} prefetch={false} className="block type-helper text-ac hover:underline mt-0.5">
            View job →
          </Link>
        )}
      </td>
      <td className="px-4 py-3">
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
      </td>
    </tr>
  )
}
export const MemoQuoteTableRow = memo(QuoteTableRow)

export { statusMeta }
