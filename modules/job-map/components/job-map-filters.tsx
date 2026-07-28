"use client"

import { SlidersHorizontal, X, Download, MapPin } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody,
} from "@/shared/ui/dialog"
import { WORKS_TYPES } from "@/lib/constants"
import type { JobMapFilters, JobMapTileMode, JobMapViewMode } from "../types/job-map-types"
import type { JobMapLocationFilter } from "../types/location-types"
import { cn } from "@/shared/utils"

const LOCATION_FILTERS: { id: JobMapLocationFilter; label: string }[] = [
  { id: "completed", label: "Completed Jobs" },
  { id: "missing", label: "Missing Locations" },
  { id: "manual", label: "Manually Located" },
]

export interface JobMapFiltersState extends JobMapFilters {
  viewMode: JobMapViewMode
  tileMode: JobMapTileMode
}

interface Props {
  filters: JobMapFiltersState
  clients: string[]
  designers: string[]
  mobileOpen: boolean
  missingCoordinates: number
  isAdmin: boolean
  geocoding: boolean
  onGenerateCoordinates: () => void
  onChange: (patch: Partial<JobMapFiltersState>) => void
  onMobileOpen: (open: boolean) => void
  onExportCsv: () => void
  onClientLegendClick: (client: string) => void
  highlightClient?: string
}

function FilterFields({
  filters, clients, designers, onChange,
}: Pick<Props, "filters" | "clients" | "designers" | "onChange">) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      <div className="sm:col-span-2">
        <label className="text-[11px] font-medium text-t3 uppercase tracking-wide mb-1 block">Search</label>
        <Input
          value={filters.search ?? ""}
          onChange={e => onChange({ search: e.target.value })}
          placeholder="Drawing no., address, client…"
          className="h-9 bg-surface-low"
        />
      </div>
      <div>
        <label className="text-[11px] font-medium text-t3 uppercase tracking-wide mb-1 block">Client</label>
        <Select value={filters.client ?? "__all"} onValueChange={v => onChange({ client: v === "__all" ? undefined : v })}>
          <SelectTrigger className="h-9 bg-surface-low"><SelectValue placeholder="All clients" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All clients</SelectItem>
            {clients.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-[11px] font-medium text-t3 uppercase tracking-wide mb-1 block">Designer</label>
        <Select value={filters.designer ?? "__all"} onValueChange={v => onChange({ designer: v === "__all" ? undefined : v })}>
          <SelectTrigger className="h-9 bg-surface-low"><SelectValue placeholder="All designers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All designers</SelectItem>
            {designers.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-[11px] font-medium text-t3 uppercase tracking-wide mb-1 block">Project Type</label>
        <Select value={filters.typeOfWorks ?? "__all"} onValueChange={v => onChange({ typeOfWorks: v === "__all" ? undefined : v })}>
          <SelectTrigger className="h-9 bg-surface-low"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All types</SelectItem>
            {WORKS_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-[11px] font-medium text-t3 uppercase tracking-wide mb-1 block">From</label>
        <Input type="date" value={filters.dateFrom ?? ""} onChange={e => onChange({ dateFrom: e.target.value || undefined })} className="h-9 bg-surface-low" />
      </div>
      <div>
        <label className="text-[11px] font-medium text-t3 uppercase tracking-wide mb-1 block">To</label>
        <Input type="date" value={filters.dateTo ?? ""} onChange={e => onChange({ dateTo: e.target.value || undefined })} className="h-9 bg-surface-low" />
      </div>
    </div>
  )
}

export function JobMapFiltersBar(props: Props) {
  const {
    filters,
    mobileOpen,
    onMobileOpen,
    onChange,
    missingCoordinates,
    isAdmin,
    geocoding,
    onGenerateCoordinates,
    onExportCsv,
    clients,
    highlightClient,
    onClientLegendClick,
  } = props

  const topClients = clients.slice(0, 8)

  return (
    <>
      <div className="oryx-surface-card bg-sr border border-bd rounded-md p-4 mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {LOCATION_FILTERS.map(tab => (
              <Button
                key={tab.id}
                variant={(filters.locationFilter ?? "completed") === tab.id ? "primary" : "outline"}
                size="sm"
                onClick={() => onChange({ locationFilter: tab.id })}
              >
                {tab.label}
              </Button>
            ))}
            <span className="w-px h-6 bg-bd hidden sm:block" />
            <Button
              variant={filters.viewMode === "pins" ? "primary" : "outline"}
              size="sm"
              onClick={() => onChange({ viewMode: "pins" })}
            >
              Pins
            </Button>
            <Button
              variant={filters.viewMode === "heatmap" ? "primary" : "outline"}
              size="sm"
              onClick={() => onChange({ viewMode: "heatmap" })}
            >
              Heatmap
            </Button>
            <span className="w-px h-6 bg-bd hidden sm:block" />
            <Button
              variant={filters.tileMode === "street" ? "primary" : "outline"}
              size="sm"
              onClick={() => onChange({ tileMode: "street" })}
            >
              Street
            </Button>
            <Button
              variant={filters.tileMode === "satellite" ? "primary" : "outline"}
              size="sm"
              onClick={() => onChange({ tileMode: "satellite" })}
            >
              Satellite
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onExportCsv}>
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" className="md:hidden" onClick={() => onMobileOpen(true)}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
            </Button>
          </div>
        </div>

        {missingCoordinates > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-bd bg-surface-low px-3 py-2 text-xs text-t2">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-t3 shrink-0" />
              {missingCoordinates.toLocaleString()} project{missingCoordinates === 1 ? "" : "s"} need map locations.
            </span>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={geocoding}
                onClick={onGenerateCoordinates}
              >
                {geocoding ? "Finding…" : "Find Missing Locations"}
              </Button>
            )}
          </div>
        )}

        <div className="hidden md:block">
          <FilterFields {...props} />
        </div>

        {topClients.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-bd">
            <span className="text-[10px] font-semibold text-t4 uppercase tracking-wide mr-1">Clients</span>
            {topClients.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => onClientLegendClick(c)}
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full border transition-colors",
                  highlightClient === c
                    ? "bg-pg border-bd text-t1 font-medium"
                    : "border-bd text-t3 hover:text-t2 hover:bg-surface-low",
                )}
              >
                {c}
              </button>
            ))}
            {highlightClient && (
              <button type="button" onClick={() => onClientLegendClick("")} className="text-xs text-t4 hover:text-t2 inline-flex items-center gap-0.5">
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>
        )}
      </div>

      <Dialog open={mobileOpen} onOpenChange={onMobileOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Map filters</DialogTitle></DialogHeader>
          <DialogBody>
            <FilterFields {...props} />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}
