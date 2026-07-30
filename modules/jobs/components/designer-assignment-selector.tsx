"use client"

import { useCallback, useMemo, useState } from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { ChevronDown } from "lucide-react"
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
      return `Assign design engineer to ${normalized}`
    }
    return "Assign design engineer to revision"
  }
  return "Assign design engineer to original drawing"
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
  className?: string
  onDesignerChanged?: (next: string) => void
}

/**
 * Assigns designer to the current work item only (original or active revision).
 * Never silently writes the parent when the target is a revision.
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
  className,
  onDesignerChanged,
}: DesignerAssignmentSelectorProps) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [optimistic, setOptimistic] = useState<string | null>(null)
  const [filter, setFilter] = useState("")
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
      toast(next ? `Design Engineer → ${next}` : "Design engineer unassigned", "success")
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

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={v => void apply(v === UNASSIGNED ? "" : v)}
      disabled={disabled || busy}
      onOpenChange={open => {
        if (!open) setFilter("")
      }}
    >
      <SelectPrimitive.Trigger
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-ac",
          (disabled || busy) && "opacity-60 cursor-not-allowed",
          className,
        )}
        style={{ border: "none", background: "transparent", padding: 0, cursor: disabled || busy ? "not-allowed" : "pointer" }}
        aria-label={title}
        title={title}
      >
        {display ? (
          <>
            <span
              className={cn(
                "inline-flex shrink-0 items-center justify-center rounded bg-surface-low text-[10px] font-bold text-t2",
                compact ? "h-5 w-5" : "h-6 w-6",
              )}
              aria-hidden
            >
              {designerInitials(display)}
            </span>
            <span className={cn("truncate text-t1", compact ? "text-xs" : "text-sm")}>
              {display}
            </span>
          </>
        ) : (
          <span className={cn("text-t3", compact ? "text-xs" : "text-sm")}>
            Assign design engineer
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-t4" />
        {busy && (
          <span className="text-[10px] text-t4" aria-live="polite">Saving…</span>
        )}
      </SelectPrimitive.Trigger>
      <SelectContent
        align="start"
        className="min-w-[220px]"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-bd px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-t3">
          {title}
        </div>
        {showSearch && (
          <div className="p-2 border-b border-bd" onKeyDown={e => e.stopPropagation()}>
            <Input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search design engineers…"
              className="h-8 text-sm"
              aria-label="Search design engineers"
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
          <p className="px-2 py-2 text-xs text-t3">No matching design engineers</p>
        )}
      </SelectContent>
    </SelectPrimitive.Root>
  )
}
