"use client"

import { useCallback, useMemo, useState } from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { ChevronDown, User } from "lucide-react"
import { SelectContent, SelectItem } from "@/components/ui/select"
import { useToast } from "@/shared/ui/toast"
import { cn } from "@/shared/utils"
import { Input } from "@/shared/ui/input"

const UNASSIGNED = "__unassigned__"

export function designerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  return parts
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? "")
    .join("")
}

export function designerAssignmentTitle(
  workItemType: "original" | "revision",
  revisionLabel?: string | null,
): string {
  if (workItemType === "revision") {
    const label = revisionLabel?.trim()
    if (label) {
      const normalized = label.toUpperCase().startsWith("REV")
        ? label
        : `Rev ${label}`
      return `Change designer for ${normalized}`
    }
    return "Change designer for revision"
  }
  return "Change designer for original drawing"
}

export type DesignerAssignmentSelectorProps = {
  workItemType: "original" | "revision"
  workItemId: string
  currentDesigner: string
  revisionLabel?: string | null
  designers: string[]
  /** Override PATCH URL — work-items model uses /api/work-items/:id */
  patchUrl?: string
  disabled?: boolean
  compact?: boolean
  /**
   * When true, render a static "Designer" label above the clickable value
   * (inspector pattern). Parent should not duplicate the label.
   */
  labeled?: boolean
  /**
   * Empty-state copy when no engineer is assigned.
   * Defaults to "Assign designer".
   */
  unassignedLabel?: string
  className?: string
  onDesignerChanged?: (next: string) => void
}

/**
 * Assigns designer to the current work item only (original or active revision).
 * Rendered as an outlined editable control (not plain text).
 */
export function DesignerAssignmentSelector({
  workItemType,
  workItemId,
  currentDesigner,
  revisionLabel = null,
  designers,
  patchUrl,
  disabled = false,
  compact = false,
  labeled = false,
  unassignedLabel = "Assign designer",
  className,
  onDesignerChanged,
}: DesignerAssignmentSelectorProps) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [optimistic, setOptimistic] = useState<string | null>(null)
  const [filter, setFilter] = useState("")
  const [open, setOpen] = useState(false)
  const title = designerAssignmentTitle(workItemType, revisionLabel)
  const display = optimistic ?? currentDesigner

  const options = useMemo(() => {
    const base =
      display && !designers.includes(display) ? [display, ...designers] : designers
    const q = filter.trim().toLowerCase()
    if (!q) return base
    return base.filter(d => d.toLowerCase().includes(q))
  }, [designers, display, filter])

  const apply = useCallback(async (next: string) => {
    if (busy || disabled || next === currentDesigner) return
    const previous = currentDesigner
    setBusy(true)
    setOptimistic(next)
    try {
      const res = await fetch(patchUrl ?? `/api/jobs/${workItemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designer: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Failed to assign design engineer", "error")
        setOptimistic(previous)
        return
      }
      toast(next ? `Designer → ${next}` : "Designer cleared", "success")
      onDesignerChanged?.(next)
    } catch {
      toast("Network error", "error")
      setOptimistic(previous)
    } finally {
      setBusy(false)
      setOptimistic(null)
      setFilter("")
    }
  }, [
    busy,
    currentDesigner,
    disabled,
    onDesignerChanged,
    patchUrl,
    toast,
    workItemId,
  ])

  const value = display ? display : UNASSIGNED
  const showSearch = designers.length > 8
  const emptyCopy = unassignedLabel

  const trigger = (
    <SelectPrimitive.Trigger
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
      className={cn(
        "group/designer inline-flex max-w-full items-center gap-2 rounded-md border border-bd bg-sr text-left outline-none",
        "transition-colors hover:bg-surface-low",
        "focus-visible:ring-2 focus-visible:ring-ac",
        "data-[state=open]:border-ac data-[state=open]:bg-surface-low",
        compact ? "h-8 px-2 text-sm" : "h-9 min-w-[10.5rem] px-2.5 text-sm",
        display ? "font-semibold text-t1" : "font-medium text-t2",
        (disabled || busy) && "cursor-not-allowed opacity-60",
        !labeled && className,
      )}
      style={{ cursor: disabled || busy ? "not-allowed" : "pointer" }}
      aria-label={title}
      title={title}
    >
      <User
        className={cn(
          "shrink-0 text-t3",
          compact ? "h-3.5 w-3.5" : "h-4 w-4",
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate">
        {display || emptyCopy}
      </span>
      <ChevronDown
        className={cn(
          "shrink-0 text-t3 transition-transform",
          compact ? "h-3.5 w-3.5" : "h-4 w-4",
          open && "rotate-180",
        )}
        aria-hidden
      />
      {busy && (
        <span className="sr-only" aria-live="polite">Saving…</span>
      )}
    </SelectPrimitive.Trigger>
  )

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={v => void apply(v === UNASSIGNED ? "" : v)}
      disabled={disabled || busy}
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) setFilter("")
      }}
    >
      {labeled ? (
        <div className={cn("min-w-0", className)}>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-t3">
            Designer
          </p>
          {trigger}
        </div>
      ) : (
        trigger
      )}
      <SelectContent
        align="start"
        className="min-w-[220px]"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-bd px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-t3">
          Designer
        </div>
        {showSearch && (
          <div className="p-2 border-b border-bd" onKeyDown={e => e.stopPropagation()}>
            <Input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search designers…"
              className="h-8 text-sm"
              aria-label="Search designers"
            />
          </div>
        )}
        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        {options.map(d => (
          <SelectItem key={d} value={d}>
            {d}
            {display === d && !designers.includes(d) ? " (not in Users)" : ""}
          </SelectItem>
        ))}
        {options.length === 0 && (
          <p className="px-2 py-2 text-xs text-t3">No matching designers</p>
        )}
      </SelectContent>
    </SelectPrimitive.Root>
  )
}
