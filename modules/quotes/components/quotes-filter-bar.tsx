"use client"
import { Clock } from "lucide-react"
import { cn } from "@/shared/utils/utils"
import { SearchField } from "@/shared/layouts/page-layout"
import { QUOTE_STATUSES } from "@/lib/types"

export interface QuotesFilterBarProps {
  search: string
  onSearchChange: (value: string) => void
  statusFilter: string
  onStatusFilterChange: (value: string) => void
  expiringSoonCount: number
  onViewSentQuotes: () => void
}

export function QuotesFilterBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  expiringSoonCount,
  onViewSentQuotes,
}: QuotesFilterBarProps) {
  return (
    <>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchField value={search} onChange={onSearchChange} placeholder="Search quotes…" className="max-w-xs" />
        <div className="flex items-center gap-1 flex-wrap">
          <button onClick={() => onStatusFilterChange("ALL")}
            className={cn("type-helper px-2 py-0.5 rounded border font-medium",
              statusFilter === "ALL" ? "bg-ac text-on-ac border-ac" : "border-bd text-t3 hover:text-t2")}>
            All
          </button>
          {QUOTE_STATUSES.map(s => (
            <button key={s.value} onClick={() => onStatusFilterChange(s.value)}
              className={cn("type-helper px-2 py-0.5 rounded border font-medium",
                statusFilter === s.value ? s.color : "border-bd text-t3 hover:text-t2")}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {expiringSoonCount > 0 && statusFilter !== "EXPIRED" && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl border border-wn-bd bg-wn-bg text-sm text-wn-tx">
          <Clock className="h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">{expiringSoonCount}</span>
            {" "}sent quote{expiringSoonCount !== 1 ? "s" : ""} expiring within 7 days —
            {" "}
            <button
              type="button"
              className="text-ac hover:text-ach font-medium underline"
              onClick={onViewSentQuotes}
            >
              view sent quotes
            </button>
          </p>
        </div>
      )}
    </>
  )
}
