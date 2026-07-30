"use client"

import { cn } from "@/shared/utils/utils"
import {
  ENGINEERING_STAGE_COLOUR,
  ENGINEERING_STAGES,
  engineeringDrawingLabel,
  getEngineeringStageFromDrawingStatus,
  type EngineeringStageId,
} from "@/modules/jobs/lib/engineering-workflow"

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
      <p
        className={cn("mt-1 truncate text-[11px] leading-snug text-t3", className)}
        title={`Engineering stage: ${stage.label}`}
      >
        <span className="text-t4">Stage</span>
        {" · "}
        <span className={cn("font-semibold", colour.text)}>{stage.label}</span>
      </p>
    )
  }

  return (
    <div
      className={cn(
        "rounded-md border border-bd/70 bg-surface-low/80 px-3 py-2.5",
        className,
      )}
      aria-label={`Engineering stage ${stage.label} for ${drawing}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-t3">
            Engineering stage
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-t1">{drawing}</span>
            <span className="text-t4" aria-hidden>
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
      </div>

      <ol className="mt-2.5 flex flex-wrap items-center gap-x-1 gap-y-1" aria-hidden>
        {ENGINEERING_STAGES.map((s, index) => {
          const active = s.id === stage.id
          const activeColour = ENGINEERING_STAGE_COLOUR[s.id as EngineeringStageId]
          return (
            <li key={s.id} className="flex items-center gap-1">
              {index > 0 ? (
                <span className="px-0.5 text-[10px] text-t4" aria-hidden>
                  →
                </span>
              ) : null}
              <span
                className={cn(
                  "text-[11px] font-medium",
                  active
                    ? cn("rounded px-1.5 py-0.5 font-semibold", activeColour.text, activeColour.tint)
                    : "text-t4",
                )}
              >
                {s.shortLabel}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
