"use client"
import { memo, useState } from "react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { useToast } from "@/shared/ui/toast"
import { formatGBP } from "@/shared/utils/utils"
import type { BillingHandoff } from "@/lib/types"

export type View = "awaiting" | "cleared" | "history"

export const HandoffQuoteValue = memo(function HandoffQuoteValue({ item, view, onQuoteSaved }: {
  item: BillingHandoff
  view: View
  onQuoteSaved?: () => void
}) {
  const { toast } = useToast()
  const [draftValue, setDraftValue] = useState("")
  const [saving, setSaving] = useState(false)

  const saveQuote = async () => {
    const parsed = parseFloat(draftValue.replace(/[£,\s]/g, ""))
    if (isNaN(parsed) || parsed < 0) {
      toast("Enter a valid amount", "error")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/billing-handoffs/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteValue: parsed }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Failed to save", "error")
        return
      }
      toast("Value saved", "success")
      onQuoteSaved?.()
    } catch {
      toast("Network error", "error")
    } finally {
      setSaving(false)
    }
  }

  if (item.quoteValue != null) {
    return <span className="text-t1 font-medium tabular-nums">{formatGBP(item.quoteValue)}</span>
  }
  if (view === "awaiting") {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={draftValue}
          onChange={e => setDraftValue(e.target.value)}
          className="h-7 w-24 text-xs tabular-nums"
          disabled={saving}
        />
        <Button size="sm" variant="outline" className="h-7 px-2 type-helper" loading={saving} onClick={saveQuote}>
          Save
        </Button>
      </div>
    )
  }
  return <span>—</span>
})
