"use client"
import { X } from "lucide-react"
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/shared/ui/select"
import { JOB_STATUSES, WORK_ITEM_TYPES, WORKS_TYPES, getJobStatus } from "@/lib/constants"

export function ActiveFilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full border border-ac/30 bg-ac-bg type-badge text-ac">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 hover:bg-ac/15 text-ac"
        aria-label={`Remove ${label} filter`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}

export interface JobsActiveFilterChipsProps {
  isCheckingQueue: boolean
  hasFilters: boolean
  search: string
  statusFilter: string
  deadlineFilter: string
  itemTypeFilter: string
  typeOfWorksFilter: string
  onlyOriginals: boolean
  onlyRevisions: boolean
  clearStatusFilter: () => void
  setDeadlineFilter: (v: string) => void
  setItemTypeFilter: (v: string) => void
  setTypeOfWorksFilter: (v: string) => void
  setOnlyOriginals: (v: boolean) => void
  setOnlyRevisions: (v: boolean) => void
  setSearch: (v: string) => void
  setPage: (v: number) => void
  clearAllFilters: () => void
}

export function JobsActiveFilterChips({
  isCheckingQueue,
  hasFilters,
  search,
  statusFilter,
  deadlineFilter,
  itemTypeFilter,
  typeOfWorksFilter,
  onlyOriginals,
  onlyRevisions,
  clearStatusFilter,
  setDeadlineFilter,
  setItemTypeFilter,
  setTypeOfWorksFilter,
  setOnlyOriginals,
  setOnlyRevisions,
  setSearch,
  setPage,
  clearAllFilters,
}: JobsActiveFilterChipsProps) {
  if (!(isCheckingQueue || hasFilters || !!search)) return null

  return (
    <div className="flex items-center gap-2 flex-wrap mb-3">
      {(isCheckingQueue || statusFilter !== "ALL") && (
        <ActiveFilterChip
          label={getJobStatus(isCheckingQueue ? "CHECKING" : statusFilter).label}
          onRemove={clearStatusFilter}
        />
      )}
      {deadlineFilter === "overdue" && (
        <ActiveFilterChip label="Overdue" onRemove={() => { setDeadlineFilter("ALL"); setPage(1) }} />
      )}
      {deadlineFilter === "today" && (
        <ActiveFilterChip label="Due today" onRemove={() => { setDeadlineFilter("ALL"); setPage(1) }} />
      )}
      {deadlineFilter === "this_week" && (
        <ActiveFilterChip label="Due this week" onRemove={() => { setDeadlineFilter("ALL"); setPage(1) }} />
      )}
      {itemTypeFilter !== "ALL" && (
        <ActiveFilterChip
          label={WORK_ITEM_TYPES.find(t => t.value === itemTypeFilter)?.label ?? itemTypeFilter}
          onRemove={() => { setItemTypeFilter("ALL"); setPage(1) }}
        />
      )}
      {typeOfWorksFilter !== "ALL" && (
        <ActiveFilterChip label={typeOfWorksFilter} onRemove={() => { setTypeOfWorksFilter("ALL"); setPage(1) }} />
      )}
      {onlyOriginals && (
        <ActiveFilterChip label="Originals only" onRemove={() => { setOnlyOriginals(false); setPage(1) }} />
      )}
      {onlyRevisions && (
        <ActiveFilterChip label="Revisions only" onRemove={() => { setOnlyRevisions(false); setPage(1) }} />
      )}
      {search && (
        <ActiveFilterChip label={`Search: ${search}`} onRemove={() => setSearch("")} />
      )}
      {(hasFilters || !!search) && !isCheckingQueue && (
        <button
          type="button"
          onClick={clearAllFilters}
          className="text-xs text-t3 hover:text-t2 underline underline-offset-2"
        >
          Clear all
        </button>
      )}
      {isCheckingQueue && (
        <button
          type="button"
          onClick={clearAllFilters}
          className="text-xs text-t3 hover:text-t2 underline underline-offset-2"
        >
          View all jobs
        </button>
      )}
    </div>
  )
}

export interface JobsFilterBarProps {
  statusFilter: string
  applyStatusFilter: (value: string) => void
  typeOfWorksFilter: string
  setTypeOfWorksFilter: (v: string) => void
  itemTypeFilter: string
  setItemTypeFilter: (v: string) => void
  deadlineFilter: string
  setDeadlineFilter: (v: string) => void
  hasFilters: boolean
  isCheckingQueue: boolean
  clearAllFilters: () => void
  setPage: (v: number) => void
}

export function JobsFilterBar({
  statusFilter,
  applyStatusFilter,
  typeOfWorksFilter,
  setTypeOfWorksFilter,
  itemTypeFilter,
  setItemTypeFilter,
  deadlineFilter,
  setDeadlineFilter,
  hasFilters,
  isCheckingQueue,
  clearAllFilters,
  setPage,
}: JobsFilterBarProps) {
  return (
    <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-sr border border-bd rounded-xl shadow-card flex-wrap">
      <span className="text-xs font-medium text-t2">Status</span>
      <div className="w-44">
        <Select value={statusFilter} onValueChange={applyStatusFilter}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {JOB_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {/* Type of Works — a Select rather than pills, unlike item type below:
          18 controlled values would overwhelm a pill row at this width. */}
      <div className="h-4 w-px bg-bd" />
      <span className="text-xs font-medium text-t2">Type of Works</span>
      <div className="w-48">
        <Select value={typeOfWorksFilter} onValueChange={v => { setTypeOfWorksFilter(v); setPage(1) }}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types of works</SelectItem>
            {WORKS_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {/* Work item type */}
      <div className="h-4 w-px bg-bd" />
      <span className="text-xs font-medium text-t2">Type</span>
      <div className="flex items-center gap-1 flex-wrap">
        <button onClick={() => { setItemTypeFilter("ALL"); setPage(1) }}
          className={`type-helper px-2.5 py-0.5 rounded-full font-medium ${itemTypeFilter === "ALL" ? "bg-ac text-on-ac" : "border border-bd text-t3 hover:text-t2"}`}>
          All
        </button>
        {WORK_ITEM_TYPES.map(t => (
          <button key={t.value} onClick={() => { setItemTypeFilter(t.value); setPage(1) }}
            className={`type-helper px-2.5 py-0.5 rounded-full font-medium ${itemTypeFilter === t.value ? `${t.color}` : "border border-bd text-t3 hover:text-t2"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Deadline filter */}
      <div className="h-4 w-px bg-bd" />
      <span className="text-xs font-medium text-t2">Deadline</span>
      <div className="flex items-center gap-1">
        {[
          { v: "ALL",       l: "All" },
          { v: "overdue",   l: "Overdue",   cls: "text-dn-tx bg-dn-bg" },
          { v: "today",     l: "Due today",  cls: "text-wn-tx bg-wn-bg" },
          { v: "this_week", l: "This week",  cls: "text-wn-tx bg-wn-bg/60" },
        ].map(({ v, l, cls }) => (
          <button key={v} onClick={() => { setDeadlineFilter(v); setPage(1) }}
            className={`type-helper px-2.5 py-0.5 rounded-full font-medium ${
              deadlineFilter === v
                ? (v === "ALL" ? "bg-ac text-on-ac" : (cls ?? "bg-ac text-on-ac"))
                : "border border-bd text-t3 hover:text-t2"
            }`}>
            {l}
          </button>
        ))}
      </div>

      {(hasFilters || isCheckingQueue) && (
        <button onClick={clearAllFilters}
          className="text-xs text-t3 hover:text-t2 underline underline-offset-2">
          {isCheckingQueue ? "View all jobs" : "Clear all"}
        </button>
      )}
    </div>
  )
}
