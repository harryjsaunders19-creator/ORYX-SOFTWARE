"use client"

import { Search } from "lucide-react"
import { Input } from "@/shared/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/ui/select"
import { cn } from "@/shared/utils/utils"
import { JOB_DOCUMENT_CATEGORIES } from "../constants"
import type { DocumentKindFilter, DocumentScopeFilter, DocumentPeriodFilter } from "../constants"
import { KIND_CHIPS } from "./job-documents-helpers"

export function JobDocumentsFilters({
  q,
  onQChange,
  scope,
  onScopeChange,
  kind,
  onKindChange,
  category,
  onCategoryChange,
  period,
  onPeriodChange,
}: {
  q: string
  onQChange: (q: string) => void
  scope: DocumentScopeFilter
  onScopeChange: (s: DocumentScopeFilter) => void
  kind: "" | DocumentKindFilter
  onKindChange: (k: "" | DocumentKindFilter) => void
  category: string
  onCategoryChange: (c: string) => void
  period: DocumentPeriodFilter
  onPeriodChange: (p: DocumentPeriodFilter) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-t4" />
        <Input
          value={q}
          onChange={e => onQChange(e.target.value)}
          placeholder="Search filename, category…"
          className="pl-9 h-10 text-base"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {(["all", "current", "previous"] as DocumentScopeFilter[]).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => onScopeChange(s)}
            className={cn(
              "text-sm px-3 py-1.5 rounded-full font-medium border",
              scope === s ? "bg-ac text-on-ac border-ac" : "border-bd text-t3 hover:text-t2",
            )}
          >
            {s === "all" ? "All Documents" : s === "current" ? "Current Revision" : "Previous Revisions"}
          </button>
        ))}
        {KIND_CHIPS.map(c => (
          <button
            key={c.value || "all-kinds"}
            type="button"
            onClick={() => onKindChange(c.value)}
            className={cn(
              "text-sm px-3 py-1.5 rounded-full font-medium border",
              kind === c.value ? "bg-sr text-t1 border-bds" : "border-bd text-t3 hover:text-t2",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={category} onValueChange={onCategoryChange}>
          <SelectTrigger className="h-9 w-[170px] text-sm">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {JOB_DOCUMENT_CATEGORIES.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={v => onPeriodChange(v as DocumentPeriodFilter)}>
          <SelectTrigger className="h-9 w-[150px] text-sm">
            <SelectValue placeholder="Uploaded" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any time</SelectItem>
            <SelectItem value="today">Uploaded today</SelectItem>
            <SelectItem value="week">This week</SelectItem>
            <SelectItem value="month">This month</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
