import { cn } from "@/lib/utils"
import { getWorkItemType } from "@/lib/constants"

/**
 * Badge for work item type — shown alongside status badge in tables and headers.
 * Colours come from a dedicated `tag-*` token set in app/globals.css — a small,
 * deliberately separate qualitative palette from the status/semantic tokens,
 * since "type" (Design/Revision/Site Visit/Survey/Inspection) has no inherent
 * success/warning/danger meaning and shouldn't borrow those colours.
 */
export function WorkItemTypeBadge({ itemType, size = "md" }: {
  itemType: string
  size?: "sm" | "md"
}) {
  const t = getWorkItemType(itemType)
  return (
    <span className={cn(
      "inline-flex items-center rounded-full font-medium whitespace-nowrap",
      t.color,
      size === "sm" ? "px-1.5 py-0 text-[10px]" : "px-2.5 py-0.5 text-[11px]",
    )}>
      {t.label}
    </span>
  )
}
