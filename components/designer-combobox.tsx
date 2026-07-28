"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/shared/utils"
import { useEffect, useState } from "react"

const UNASSIGNED = "__unassigned__"

interface Props {
  value: string
  onChange: (name: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  autoFocus?: boolean
  allowUnassigned?: boolean
  /** Pre-loaded Users-tab names. When provided and non-empty, skips fetch. */
  designers?: string[]
}

/**
 * Designer / engineer picker — dropdown of active Users-tab names only.
 * No free text, so job.designer always matches performance attribution.
 */
export function DesignerCombobox({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  autoFocus,
  allowUnassigned = true,
  designers: designersProp,
}: Props) {
  const [fetched, setFetched] = useState<string[]>([])
  // Prefer parent list when it has names; otherwise use / fall back to fetch.
  const designers =
    designersProp && designersProp.length > 0 ? designersProp : fetched

  useEffect(() => {
    if (designersProp && designersProp.length > 0) return
    let cancelled = false
    fetch("/api/jobs/designers")
      .then(r => r.json() as Promise<{ designers: string[] }>)
      .then(d => {
        if (!cancelled) setFetched(d.designers ?? [])
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [designersProp])

  // Keep a legacy free-text value visible until the user picks a directory name.
  const options =
    value && !designers.includes(value) ? [value, ...designers] : designers

  const selectValue = value ? value : UNASSIGNED

  return (
    <Select
      value={selectValue}
      onValueChange={v => onChange(v === UNASSIGNED ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn("h-8", className)}
        style={{ height: "32px" }}
        autoFocus={autoFocus}
        aria-label="Assign designer"
      >
        <SelectValue placeholder={placeholder ?? "Select a user…"} />
      </SelectTrigger>
      <SelectContent>
        {allowUnassigned && (
          <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        )}
        {options.map(d => (
          <SelectItem key={d} value={d}>
            {d}
            {value === d && !designers.includes(d) ? " (not in Users)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
