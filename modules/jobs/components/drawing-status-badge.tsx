import { cn } from "@/shared/utils"
import { Typography } from "@/shared/design/typography"
import {
  getDrawingStatusBadgeClass,
  getDrawingStatusColour,
  getDrawingStatusLabel,
} from "@/modules/jobs/lib/drawing-status-colours"

/**
 * Compact Drawing Status treatment — coloured text + dot + light tint.
 * Used by register selectors, inspector, and revision history.
 */
export function DrawingStatusBadge({
  status,
  size = "md",
  className,
}: {
  status: string
  size?: "md" | "lg"
  className?: string
}) {
  const label = getDrawingStatusLabel(status)
  const colour = getDrawingStatusColour(status)
  const badge = getDrawingStatusBadgeClass(status)

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5",
        Typography.Badge,
        "font-medium",
        badge,
        size === "lg" && "px-2.5 py-1",
        className,
      )}
    >
      <span
        className={cn(
          "rounded-full shrink-0",
          size === "lg" ? "h-2 w-2" : "h-1.5 w-1.5",
          colour.dot,
        )}
        aria-hidden
      />
      {label}
    </span>
  )
}

/** Static Complete label for closed projects (no active work). */
export function DrawingStatusCompleteLabel({
  detail = "No Active Work",
  className,
}: {
  detail?: string
  className?: string
}) {
  const colour = getDrawingStatusColour("ISSUED")
  return (
    <div className={cn("min-w-0", className)}>
      <p className={cn("text-sm font-medium", colour.text)}>Complete</p>
      <p className="mt-0.5 text-xs text-t3">{detail}</p>
    </div>
  )
}
