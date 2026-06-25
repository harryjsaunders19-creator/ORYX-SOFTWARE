"use client"
import * as SelectPrimitive from "@radix-ui/react-select"
import { ChevronDown } from "lucide-react"
import { SelectContent, SelectItem, SelectSeparator } from "@/components/ui/select"
import { StatusBadge } from "@/components/status-badge"
import { JOB_STATUSES } from "@/lib/constants"

const NEW_DESIGNER  = "__new__"
const UNASSIGNED     = "__unassigned__"

/** Status cell that looks like a plain badge until clicked, then opens a real dropdown.
 *  Keeps the table visually clean (no permanent input boxes) while making status changeable
 *  without leaving the row. `size="lg"` is used in the jobs table, where completion status
 *  is meant to be the visually dominant column — other call sites keep the compact default. */
export function InlineStatusSelect({ status, onChange, size = "md" }: { status: string; onChange: (status: string) => void; size?: "md" | "lg" }) {
  return (
    <SelectPrimitive.Root value={status} onValueChange={onChange}>
      <SelectPrimitive.Trigger
        onClick={e => e.stopPropagation()}
        className="inline-flex items-center gap-1 rounded outline-none focus-visible:ring-2 focus-visible:ring-ac"
        style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer" }}
        aria-label="Change status"
      >
        <StatusBadge status={status} size={size} />
        <ChevronDown className="h-3 w-3 text-t4 opacity-0 group-hover:opacity-100 transition-opacity" />
      </SelectPrimitive.Trigger>
      <SelectContent align="start">
        {JOB_STATUSES.map(s => (
          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
        ))}
      </SelectContent>
    </SelectPrimitive.Root>
  )
}

/** Designer cell — pick an existing designer in one click, or fall back to "+ New designer…"
 *  which signals the caller to open the full assign-designer modal for free-text entry. */
export function InlineDesignerSelect({ designer, designers, onChange, onRequestNew }: {
  designer: string
  designers: string[]
  onChange: (designer: string) => void
  onRequestNew: () => void
}) {
  const value = designer ? designer : UNASSIGNED
  // Make sure the job's current designer always appears as an option even if it somehow
  // isn't in the distinct-designers list yet (e.g. very first job for a brand-new name).
  const options = designer && !designers.includes(designer) ? [designer, ...designers] : designers

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={v => { if (v === NEW_DESIGNER) onRequestNew(); else onChange(v === UNASSIGNED ? "" : v) }}
    >
      <SelectPrimitive.Trigger
        onClick={e => e.stopPropagation()}
        className="inline-flex items-center gap-1 rounded outline-none focus-visible:ring-2 focus-visible:ring-ac"
        style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer" }}
        aria-label="Assign designer"
      >
        {designer
          ? <p className="text-xs text-t2">{designer}</p>
          : <p className="text-xs text-t4 italic">Unassigned</p>}
        <ChevronDown className="h-3 w-3 text-t4 opacity-0 group-hover:opacity-100 transition-opacity" />
      </SelectPrimitive.Trigger>
      <SelectContent align="start">
        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        {options.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
        <SelectSeparator />
        <SelectItem value={NEW_DESIGNER}>+ New designer…</SelectItem>
      </SelectContent>
    </SelectPrimitive.Root>
  )
}
