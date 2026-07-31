"use client"

import { cn } from "@/shared/utils/utils"
import {
  ENGINEERING_STAGE_COLOUR,
  ENGINEERING_STAGES,
  engineeringDrawingLabel,
  getEngineeringStageFromDrawingStatus,
  type EngineeringStageId,
} from "@/modules/jobs/lib/engineering-workflow"

/** Request → Design → Check → Issue (Complete maps past Issue). */
const PIPELINE_STAGES = ["request", "design", "check", "issue"] as const

/** Subtle never-wrap labels under the pipeline (Issue → Issued for clarity). */
const PIPELINE_LABELS: Record<(typeof PIPELINE_STAGES)[number], string> = {
  request: "Request",
  design: "Design",
  check: "Check",
  issue: "Issued",
}

type Props = {
  drawingStatus: string | null | undefined
  /** When true (no active drawing work), stage resolves to Complete. */
  closed?: boolean
  currentWorkType?: "original" | "revision" | "none" | string
  revisionLetter?: string | null
  currentWorkLabel?: string | null
  /**
   * `panel` — inspector strip under status chips
   * `inline` — compact secondary line under Drawing Status in the register
   */
  variant?: "panel" | "inline"
  className?: string
}

function stagePipelineIndex(stageId: EngineeringStageId): number {
  if (stageId === "complete") return PIPELINE_STAGES.length
  const idx = PIPELINE_STAGES.indexOf(stageId)
  return idx >= 0 ? idx : 0
}

/**
 * Stage pipeline: Request → Design → Check → Issued.
 * Use `labeled` in the inspector for new-user context; omit in dense register rows.
 */
export function StagePipeline({
  stageId,
  className,
  labeled = false,
}: {
  stageId: EngineeringStageId
  className?: string
  /** Show Request / Design / Check / Issued under the dots. */
  labeled?: boolean
}) {
  const activeIdx = stagePipelineIndex(stageId)

  if (!labeled) {
    const activeColour = ENGINEERING_STAGE_COLOUR[
      stageId === "complete"
        ? "complete"
        : (PIPELINE_STAGES[Math.min(activeIdx, PIPELINE_STAGES.length - 1)] ?? "request")
    ]
    return (
      <ol
        className={cn("flex items-center gap-0.5", className)}
        aria-label={`Stage pipeline at ${stageId}`}
      >
        {PIPELINE_STAGES.map((id, index) => {
          const done = index < activeIdx || stageId === "complete"
          const active = index === activeIdx && stageId !== "complete"
          return (
            <li key={id} className="flex items-center gap-0.5">
              {index > 0 ? (
                <span
                  className={cn(
                    "h-px w-2.5",
                    done || active ? activeColour.dot : "bg-bd",
                    (done || active) && "opacity-50",
                  )}
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  "rounded-full",
                  active ? "h-2 w-2" : "h-1.5 w-1.5",
                  active || done ? "bg-ac2" : "bg-bd",
                  active && "outline outline-2 outline-offset-1 outline-ac2/35",
                )}
                title={PIPELINE_LABELS[id]}
                aria-hidden
              />
            </li>
          )
        })}
      </ol>
    )
  }

  return (
    <div
      className={cn("w-full max-w-[17.5rem]", className)}
      aria-label={`Stage pipeline at ${stageId}`}
    >
      <div className="flex items-center px-0.5">
        {PIPELINE_STAGES.map((id, index) => {
          const done = index < activeIdx || stageId === "complete"
          const active = index === activeIdx && stageId !== "complete"
          return (
            <div key={id} className="flex min-w-0 flex-1 items-center">
              {index > 0 ? (
                <span
                  className={cn(
                    "h-px min-w-[0.5rem] flex-1",
                    done || active ? "bg-ac2/45" : "bg-bd",
                  )}
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  "mx-auto shrink-0 rounded-full",
                  active ? "h-2.5 w-2.5" : "h-2 w-2",
                  active || done ? "bg-ac2" : "bg-bd",
                  active && "ring-2 ring-ac2/30 ring-offset-1 ring-offset-s2",
                )}
                title={PIPELINE_LABELS[id]}
                aria-hidden
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1 flex">
        {PIPELINE_STAGES.map((id, index) => {
          const active =
            (index === activeIdx && stageId !== "complete")
            || (stageId === "complete" && id === "issue")
          const done = index < activeIdx
          return (
            <span
              key={id}
              className={cn(
                "min-w-0 flex-1 text-center text-[9px] font-medium leading-none tracking-wide whitespace-nowrap",
                active ? "font-semibold text-ac2" : done ? "text-t2" : "text-t3",
              )}
            >
              {PIPELINE_LABELS[id]}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Compact engineering lifecycle indicator.
 * Derived from Drawing Status — does not store a second workflow field.
 */
export function EngineeringWorkflowIndicator({
  drawingStatus,
  closed = false,
  currentWorkType = "original",
  revisionLetter,
  currentWorkLabel,
  variant = "panel",
  className,
}: Props) {
  const stage = getEngineeringStageFromDrawingStatus(drawingStatus, { closed })
  const colour = ENGINEERING_STAGE_COLOUR[stage.id]
  const drawing = engineeringDrawingLabel({
    currentWorkType,
    revisionLetter,
    currentWorkLabel,
  })

  if (variant === "inline") {
    return (
      <div className={cn("mt-1 flex min-w-0 items-center gap-2", className)}>
        <StagePipeline stageId={stage.id} />
        <p
          className="min-w-0 truncate text-[11px] leading-snug text-t2"
          title={`Engineering stage: ${stage.label}`}
        >
          <span className={cn("font-semibold", colour.text)}>{stage.label}</span>
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "rounded-md border border-bd/70 bg-surface-low/80 px-3 py-2",
        className,
      )}
      aria-label={`Engineering stage ${stage.label} for ${drawing}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-t2">
            Engineering stage
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-t1">{drawing}</span>
            <span className="text-t3" aria-hidden>
              ·
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-bd/60 px-2 py-0.5 text-xs font-semibold",
                colour.text,
                colour.tint,
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", colour.dot)} aria-hidden />
              {stage.label}
            </span>
          </p>
        </div>
        <StagePipeline stageId={stage.id} labeled />
      </div>

      <ol className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1" aria-hidden>
        {PIPELINE_STAGES.map((id, index) => {
          const s = ENGINEERING_STAGES.find(x => x.id === id)!
          const active = id === stage.id || (stage.id === "complete" && id === "issue")
          const activeColour = ENGINEERING_STAGE_COLOUR[id]
          return (
            <li key={id} className="flex items-center gap-1">
              {index > 0 ? (
                <span className="px-0.5 text-[10px] text-t3" aria-hidden>
                  →
                </span>
              ) : null}
              <span
                className={cn(
                  "text-[11px] font-medium",
                  active
                    ? cn("rounded px-1.5 py-0.5 font-semibold", activeColour.text, activeColour.tint)
                    : "text-t3",
                )}
              >
                {PIPELINE_LABELS[id] ?? s.shortLabel}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
