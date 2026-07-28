"use client"
import { MapPin, Download, Plus } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { StatusBadge } from "@/modules/jobs/components/badges/status-badge"
import { PageBreadcrumb } from "@/shared/layouts/page-layout"
import { formatGBP } from "@/shared/utils/utils"
import type { ParentJobDashboard } from "@/modules/jobs/types/parent-dashboard-types"
import type { DesignWorkItemRow } from "@/modules/jobs/types/design-work-item-types"
import { KpiCard, Pill } from "./job-page-primitives"
import { priorityLabel } from "./parent-job-helpers"

interface ParentJobHeaderProps {
  parent: ParentJobDashboard["parent"]
  current: DesignWorkItemRow | null
  data: Pick<ParentJobDashboard, "canAddRevision" | "nextRevisionLetter" | "revisionCount" | "invoiceSummary">
  siteLine: string | null | undefined
  currentRevLabel: string
  outstanding: number
  pTone: "dn" | "neutral" | null
  canExportCat2: boolean
  cat2Exporting: boolean
  onRevOpen: () => void
  onCat2Export: () => void
  onNavigateJobs: () => void
}

export function ParentJobHeader({
  parent,
  current,
  data,
  siteLine,
  currentRevLabel,
  outstanding,
  pTone,
  canExportCat2,
  cat2Exporting,
  onRevOpen,
  onCat2Export,
  onNavigateJobs,
}: ParentJobHeaderProps) {
  const summary = data.invoiceSummary

  return (
    <>
      <PageBreadcrumb
        items={[
          { label: "Jobs", onClick: onNavigateJobs },
          { label: parent.drawingNumber, mono: true },
        ]}
      />

      {/* Header — Stitch Job Details */}
      <header className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
        <div className="min-w-0 space-y-2">
          <h1 className="oryx-page-title text-t1 font-mono">
            {parent.drawingNumber}
          </h1>
          {siteLine && (
            <p className="text-sm text-t3 flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{siteLine}</span>
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <span className="type-label text-t3">Client</span>
            <span className="text-sm font-semibold text-t1">{parent.clientCompany}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 lg:self-center">
          <div className="flex flex-wrap gap-2 lg:mr-1 lg:pr-4 lg:border-r lg:border-bd">
            {current && <StatusBadge status={current.status} />}
            {current?.revisionLetter && (
              <Pill tone="ac">Revision {current.revisionLetter}</Pill>
            )}
            {current?.workType === "ORIGINAL" && !current.revisionLetter && (
              <Pill tone="neutral">Original Issue</Pill>
            )}
            {pTone && current?.priority && (
              <Pill tone={pTone}>{priorityLabel(current.priority)}</Pill>
            )}
          </div>
          {data.canAddRevision && (
            <Button variant="primary" size="sm" onClick={onRevOpen}>
              <Plus className="h-3.5 w-3.5" />
              Create Revision
              {data.nextRevisionLetter ? ` ${data.nextRevisionLetter}` : ""}
            </Button>
          )}
        </div>
      </header>

      {/* Actions — CAT II and related job actions */}
      {canExportCat2 && (
        <section className="rounded-xl border border-bd bg-sr p-6 mb-6">
          <h2 className="text-base font-semibold text-t1 mb-4">Actions</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onCat2Export}
              loading={cat2Exporting}
            >
              <Download className="h-3.5 w-3.5" />
              Export CAT II Check Sheet
            </Button>
          </div>
        </section>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <KpiCard label="Current Revision" value={currentRevLabel} />
        <KpiCard
          label="Active Designer"
          value={current?.designer?.trim() || "Unassigned"}
        />
        <KpiCard
          label="Total Revisions"
          value={String(data.revisionCount)}
        />
        <KpiCard
          label="Total Billed"
          value={formatGBP(summary.billedTotal) ?? "—"}
        />
        <KpiCard
          label="Outstanding"
          value={formatGBP(outstanding) ?? "—"}
          badge={outstanding > 0 ? "Due" : null}
        />
      </div>
    </>
  )
}
