"use client"

import type { RefObject } from "react"
import { MoreHorizontal, Plus, Search, SlidersHorizontal, Upload, Download, X } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { cn } from "@/shared/utils/utils"
import type { JobsRegisterScope } from "./jobs-register-types"

const MOBILE_SCOPES: { id: JobsRegisterScope; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "with_active_revision", label: "Active Revision" },
  { id: "completed", label: "Completed" },
]

type Props = {
  title: string
  subtitle: string
  search: string
  onSearchChange: (value: string) => void
  searchRef?: RefObject<HTMLInputElement | null>
  scope: JobsRegisterScope
  onScopeChange: (scope: JobsRegisterScope) => void
  showProjectActions: boolean
  canCreate: boolean
  canImport: boolean
  onNewProject: () => void
  onFilters: () => void
  onExport: () => void
  onImport: () => void
  summaryLabel: string
}

export function MobileJobsHeader({
  title,
  subtitle,
  search,
  onSearchChange,
  searchRef,
  scope,
  onScopeChange,
  showProjectActions,
  canCreate,
  canImport,
  onNewProject,
  onFilters,
  onExport,
  onImport,
  summaryLabel,
}: Props) {
  return (
    <header className="shrink-0 border-b border-bd bg-s1 px-4 pt-3 pb-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 text-[28px] font-bold leading-tight tracking-tight text-t1">
          {title}
        </h1>
        {showProjectActions && canCreate ? (
          <Button
            type="button"
            size="sm"
            className="h-11 w-11 shrink-0 p-0"
            onClick={onNewProject}
            aria-label="New Project"
            title="New Project"
          >
            <Plus className="h-5 w-5" />
          </Button>
        ) : null}
      </div>

      <p className="mt-1.5 text-sm leading-snug text-t3">{subtitle}</p>

      <div className="relative mt-3 w-full min-w-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t4" />
        <Input
          ref={searchRef}
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search drawing number, client or site"
          className="h-11 w-full min-w-0 border-bd bg-surface-low pl-10 pr-10 text-sm"
          aria-label="Search projects"
        />
        {search ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-t4 hover:text-t2"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {showProjectActions ? (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-bd bg-surface-low px-3 text-sm font-medium text-t1"
            onClick={onFilters}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-bd bg-surface-low px-3 text-sm font-medium text-t1"
                aria-label="More actions"
              >
                <MoreHorizontal className="h-4 w-4" />
                More actions
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={onExport}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canImport} onSelect={onImport}>
                <Upload className="mr-2 h-4 w-4" />
                Import
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      {!showProjectActions ? null : (
        <div
          className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Project scope"
        >
          {MOBILE_SCOPES.map(s => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={scope === s.id}
              onClick={() => onScopeChange(s.id)}
              className={cn(
                "inline-flex h-10 shrink-0 items-center rounded-md px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
                scope === s.id
                  ? "bg-ac text-on-ac"
                  : "border border-bd bg-surface-low text-t3",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <p className="mt-3 text-sm text-t3 tabular-nums">{summaryLabel}</p>
    </header>
  )
}
