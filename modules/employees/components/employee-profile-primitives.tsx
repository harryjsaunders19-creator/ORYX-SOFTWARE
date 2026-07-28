"use client"
import { cn } from "@/shared/utils"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active", ON_LEAVE: "On Leave", SUSPENDED: "Suspended", FORMER: "Former",
}
export const EMP_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: "Full Time", PART_TIME: "Part Time", CONTRACTOR: "Contractor", TEMPORARY: "Temporary",
}

export type Tab = "personal" | "employment" | "leave" | "skills" | "documents" | "notes" | "activity"

export function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="type-badge text-t4">{label}</dt>
      <dd className="text-t1">{value?.trim() ? value : "—"}</dd>
    </div>
  )
}

export function Field({ label, value, onChange, className }: {
  label: string; value: string; onChange: (v: string) => void; className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label>{label}</Label>
      <Input value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}
