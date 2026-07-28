"use client"
import { Check, PenTool } from "lucide-react"
import { cn } from "@/shared/utils"
import { getWorkItemRefHint, CREATABLE_ITEM_TYPES } from "@/lib/constants"
import { TYPE_META } from "./job-form-constants"

interface JobFormItemTypeProps {
  selectableTypes: typeof CREATABLE_ITEM_TYPES
  selectedItemType: string
  onSelect: (itemType: string) => void
}

export function JobFormItemType({ selectableTypes, selectedItemType, onSelect }: JobFormItemTypeProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {selectableTypes.map(t => {
        const meta = TYPE_META[t.value] ?? {
          icon: PenTool,
          title: t.label,
          description: getWorkItemRefHint(t.value),
        }
        const Icon = meta.icon
        const selected = selectedItemType === t.value
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onSelect(t.value)}
            className={cn(
              "relative flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-ic/40",
              selected
                ? "border-rs-bd bg-rs-bg shadow-sm"
                : "border-bd bg-sr hover:border-bds hover:bg-surface-low/50",
            )}
            aria-pressed={selected}
          >
            {selected && (
              <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-rs-ic text-white">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
            )}
            <span className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg",
              selected ? "bg-white/70 text-rs-ic" : "bg-pg text-t3",
            )}>
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <p className={cn("text-sm font-semibold", selected ? "text-rs-tx" : "text-t1")}>
                {meta.title}
              </p>
              <p className="mt-1 font-mono type-helper text-t3">
                {getWorkItemRefHint(t.value)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-t3">
                {meta.description}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
