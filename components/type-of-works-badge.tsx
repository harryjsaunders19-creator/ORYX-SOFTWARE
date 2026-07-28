import { cn } from "@/lib/utils"
import { worksTypeDisplayLabel } from "@/lib/constants"

/**
 * Badge for `Job.typeOfWorks` — the standardised scaffold/work-type controlled
 * list (`WORKS_TYPES` in lib/constants.ts). Custom types are stored as
 * Other + description; the badge always shows the human label, never the
 * "Other" sentinel when a description exists.
 */
export function TypeOfWorksBadge({ typeOfWorks, customTypeDescription, size = "md" }: {
  typeOfWorks: string | null | undefined
  customTypeDescription?: string | null
  size?: "sm" | "md"
}) {
  const label = worksTypeDisplayLabel(typeOfWorks, customTypeDescription)
  if (!typeOfWorks || !label) {
    return <span className="text-t4 text-xs italic">—</span>
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-medium whitespace-nowrap bg-t1/[0.06] text-t2 max-w-[180px] truncate",
        size === "sm" ? "px-1.5 py-0 text-[10px]" : "px-2.5 py-0.5 text-[11px]",
      )}
      title={label}
    >
      {label}
    </span>
  )
}
