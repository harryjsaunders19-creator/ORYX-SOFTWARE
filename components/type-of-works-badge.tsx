import { cn } from "@/lib/utils"
import { OTHER_WORKS_TYPE } from "@/lib/constants"
import { Typography } from "@/shared/design/typography"

/**
 * Badge for `Job.typeOfWorks` — the standardised scaffold/work-type controlled
 * list (`WORKS_TYPES` in lib/constants.ts: Access Scaffold, Birdcage
 * (Internal/External), Temporary Roof, etc. — see PROJECT_OVERVIEW.md §22).
 * Deliberately a single neutral tone rather than a colour per category: the
 * works-type list has eighteen values, so a distinct hue per entry (like
 * WorkItemTypeBadge's five-way categorical palette) wouldn't stay legible or
 * maintainable. The badge shape alone is enough to make it scannable as a tag
 * distinct from surrounding plain text.
 *
 * When typeOfWorks is "Other", the literal word "Other" tells a reader
 * nothing — pass customTypeDescription so the badge shows what was actually
 * specified instead.
 */
export function TypeOfWorksBadge({ typeOfWorks, customTypeDescription, size = "md" }: {
  typeOfWorks: string | null | undefined
  customTypeDescription?: string | null
  size?: "sm" | "md"
}) {
  if (!typeOfWorks) return <span className={cn(Typography.Helper, "text-t4 italic")}>—</span>
  const label = typeOfWorks === OTHER_WORKS_TYPE && customTypeDescription
    ? customTypeDescription
    : typeOfWorks
  return (
    <span
      className={cn(
        Typography.Badge,
        "inline-flex items-center rounded-md whitespace-nowrap bg-t1/[0.06] text-t2 max-w-[180px] truncate",
        size === "sm" ? "px-1.5 py-0" : "px-2.5 py-0.5",
      )}
      title={typeOfWorks === OTHER_WORKS_TYPE ? `Other — ${customTypeDescription ?? "no description"}` : undefined}
    >
      {label}
    </span>
  )
}
