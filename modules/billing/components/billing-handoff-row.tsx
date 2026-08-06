"use client"
import { memo } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ArrowUpRight } from "lucide-react"
import { WorkItemTypeBadge } from "@/modules/jobs/components/badges/work-item-type-badge"
import { TypeOfWorksBadge } from "@/modules/jobs/components/badges/type-of-works-badge"
import { formatDisplayDate } from "@/shared/utils/utils"
import type { BillingHandoff } from "@/lib/types"
import { HandoffQuoteValue, type View } from "./billing-handoff-quote-value"

export const HandoffRow = memo(function HandoffRow({ item, view, selected, onToggle, onQuoteSaved }: {
  item: BillingHandoff; view: View; selected: boolean; onToggle: (id: string) => void
  onQuoteSaved?: () => void
}) {
  return (
    <tr className="hover:bg-hover-surface">
      {view === "awaiting" && (
        <td className="px-3 py-3 w-8">
          <input
            type="checkbox"
            className="h-4 w-4 accent-ac"
            aria-label={`Select ${item.drawingNumber}`}
            checked={selected}
            onChange={() => onToggle(item.id)}
          />
        </td>
      )}
      <td className="px-4 py-3 type-drawing-number text-ac whitespace-nowrap font-semibold">{item.drawingNumber}</td>
      <td className="px-4 py-3 whitespace-nowrap"><TypeOfWorksBadge typeOfWorks={item.typeOfWorks} customTypeDescription={item.customTypeDescription} size="sm" /></td>
      <td className="px-4 py-3 text-t1 whitespace-nowrap">{item.clientCompany}</td>
      <td className="px-4 py-3 text-t3 max-w-[220px] truncate">{item.address}</td>
      <td className="px-4 py-3 whitespace-nowrap"><WorkItemTypeBadge itemType={item.itemType} size="sm" /></td>
      <td className="px-4 py-3 text-t3 tabular-nums whitespace-nowrap">{formatDisplayDate(item.completionDate)}</td>
      <td className="px-4 py-3 text-t2 whitespace-nowrap">{item.designer || <span className="text-t4 italic">Unassigned</span>}</td>
      <td className="px-4 py-3 text-t1 font-medium tabular-nums whitespace-nowrap">
        <HandoffQuoteValue item={item} view={view} onQuoteSaved={onQuoteSaved} />
      </td>
      {view === "cleared" && (
        <>
          <td className="px-4 py-3 text-t3 tabular-nums whitespace-nowrap">
            {item.clearedByAccountsAt ? format(new Date(item.clearedByAccountsAt), "d MMM yyyy") : "—"}
          </td>
          <td className="px-4 py-3 text-t3 whitespace-nowrap">{item.clearedBy || "—"}</td>
        </>
      )}
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <Link href={`/jobs/${item.sourceJobId}`} className="text-xs text-ac hover:text-ach font-medium inline-flex items-center gap-1">
          View job <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </td>
    </tr>
  )
})

export const HandoffMobileCard = memo(function HandoffMobileCard({ item, view, selected, onToggle, onQuoteSaved }: {
  item: BillingHandoff
  view: View
  selected: boolean
  onToggle: (id: string) => void
  onQuoteSaved?: () => void
}) {
  return (
    <div className="rounded-xl border border-bd bg-sr shadow-card p-3.5 space-y-2.5">
      <div className="flex items-start gap-2">
        {view === "awaiting" && (
          <input
            type="checkbox"
            className="h-4 w-4 accent-ac mt-1 shrink-0"
            aria-label={`Select ${item.drawingNumber}`}
            checked={selected}
            onChange={() => onToggle(item.id)}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="type-drawing-number type-badge text-ac">{item.drawingNumber}</span>
            <WorkItemTypeBadge itemType={item.itemType} size="sm" />
          </div>
          <p className="text-sm font-medium text-t1 mt-1">{item.clientCompany}</p>
          <p className="text-xs text-t3 mt-0.5 line-clamp-2">{item.address}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs">
        <TypeOfWorksBadge typeOfWorks={item.typeOfWorks} customTypeDescription={item.customTypeDescription} size="sm" />
        <span className="text-t3 tabular-nums">{formatDisplayDate(item.completionDate)}</span>
        {item.designer && <span className="text-t2 truncate">{item.designer}</span>}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-bd/60">
        <HandoffQuoteValue item={item} view={view} onQuoteSaved={onQuoteSaved} />
        <Link href={`/jobs/${item.sourceJobId}`} className="text-xs text-ac hover:text-ach font-medium inline-flex items-center gap-1 shrink-0">
          View job <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {view === "cleared" && (
        <p className="type-helper text-t3">
          Cleared {item.clearedByAccountsAt ? format(new Date(item.clearedByAccountsAt), "d MMM yyyy") : "—"}
          {item.clearedBy ? ` · ${item.clearedBy}` : ""}
        </p>
      )}
    </div>
  )
})
