"use client"

import { cn } from "@/shared/utils/utils"
import { eventTypeLabel } from "../lib/calendar-display"

interface EventPillProps {
  title: string
  color: string
  time?: string
  categoryName?: string
  onClick?: () => void
  compact?: boolean
}

export function EventPill({
  title,
  color,
  time,
  categoryName,
  onClick,
  compact = false,
}: EventPillProps) {
  const typeLabel = categoryName ? eventTypeLabel("", categoryName) : undefined
  const a11y = typeLabel ? `${typeLabel}: ${title}` : title

  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation()
        onClick?.()
      }}
      className={cn(
        "group/pill w-full text-left truncate flex items-center gap-1.5",
        "rounded-md border border-transparent",
        "transition-[background-color,box-shadow,opacity] duration-150 ease-out",
        "hover:opacity-95 hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ac/35",
        compact ? "px-1.5 py-1 text-[10px] leading-tight" : "px-2 py-1.5 text-[11px] leading-snug",
        "font-medium",
      )}
      style={{
        backgroundColor: `${color}1A`,
        borderLeft: `3px solid ${color}`,
        color: "var(--color-t1)",
      }}
      title={a11y}
      aria-label={a11y}
    >
      {time ? (
        <span className="shrink-0 tabular-nums font-normal opacity-70 type-helper">
          {time}
        </span>
      ) : null}
      <span className="min-w-0 truncate font-semibold tracking-tight">{title}</span>
    </button>
  )
}
