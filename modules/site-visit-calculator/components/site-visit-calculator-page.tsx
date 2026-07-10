"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import "./print.css"
import {
  PageShell,
  PageHeader,
  DataPanel,
  surfaceCard,
} from "@/shared/layouts/page-layout"
import { Button } from "@/shared/ui/button"
import { Label } from "@/shared/ui/label"
import { Input } from "@/shared/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { useToast } from "@/shared/ui/toast"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import { formatGBP } from "@/shared/utils/utils"
import {
  Building2,
  Copy,
  Download,
  History,
  Printer,
  Save,
  Trash2,
} from "lucide-react"
import {
  DEFAULT_SITE_HOURS,
  ORYX_OFFICE,
  SITE_HOUR_PRESETS,
} from "../constants"
import type { SavedSiteVisitCalculation, SiteVisitCalculationResult } from "../types"
import { buildSummaryText } from "../services/summary-text"
import { AddressAutocomplete, type AddressSelection } from "./address-autocomplete"
import { CalculationSummary } from "./calculation-summary"

export default function SiteVisitCalculatorPage() {
  const { toast } = useToast()
  const [siteAddress, setSiteAddress] = useState("")
  const [selection, setSelection] = useState<AddressSelection | null>(null)
  const [siteHours, setSiteHours] = useState(String(DEFAULT_SITE_HOURS))
  const [customHours, setCustomHours] = useState(false)
  const [result, setResult] = useState<SiteVisitCalculationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedSiteVisitCalculation[]>([])
  const [saveLabel, setSaveLabel] = useState("")
  const [showSaved, setShowSaved] = useState(false)

  const debouncedAddress = useDebouncedValue(siteAddress, 500)
  const hours = parseFloat(siteHours)
  const calcRef = useRef(0)

  const loadSaved = useCallback(async () => {
    try {
      const res = await fetch("/api/site-visit-calculator/saved")
      if (!res.ok) return
      const data = await res.json()
      setSaved(data.items ?? [])
    } catch { /* non-fatal */ }
  }, [])

  useEffect(() => { loadSaved() }, [loadSaved])

  useEffect(() => {
    const addr = debouncedAddress.trim()
    if (!addr) {
      setResult(null)
      setError(null)
      return
    }
    if (!Number.isFinite(hours) || hours <= 0) {
      setError("Select a valid time on site")
      return
    }

    const id = ++calcRef.current
    setLoading(true)
    setError(null)

    fetch("/api/site-visit-calculator/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteAddress: addr,
        siteLat: selection?.lat,
        siteLng: selection?.lng,
        siteHours: hours,
      }),
    })
      .then(async res => {
        const data = await res.json()
        if (id !== calcRef.current) return
        if (!res.ok) {
          setResult(null)
          setError(data.error ?? "Calculation failed")
          return
        }
        setResult(data.result)
      })
      .catch(() => {
        if (id !== calcRef.current) return
        setResult(null)
        setError("Could not reach the server — check your connection")
      })
      .finally(() => {
        if (id === calcRef.current) setLoading(false)
      })
  }, [debouncedAddress, hours, selection?.lat, selection?.lng])

  const copySummary = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(buildSummaryText(result))
      toast("Summary copied", "success")
    } catch {
      toast("Failed to copy", "error")
    }
  }

  const printSummary = () => {
    window.print()
  }

  const exportPdf = async () => {
    if (!result) return
    try {
      const res = await fetch("/api/site-visit-calculator/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result }),
      })
      if (!res.ok) {
        toast("PDF export failed", "error")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `site-visit-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast("PDF export failed", "error")
    }
  }

  const saveCalculation = async () => {
    if (!result) return
    try {
      const res = await fetch("/api/site-visit-calculator/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: saveLabel || null, result }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast(data.error ?? "Save failed", "error")
        return
      }
      toast("Calculation saved", "success")
      setSaveLabel("")
      loadSaved()
    } catch {
      toast("Save failed", "error")
    }
  }

  const loadSavedItem = async (id: string) => {
    try {
      const res = await fetch(`/api/site-visit-calculator/saved/${id}`)
      if (!res.ok) return
      const data = await res.json()
      setSiteAddress(data.item.siteAddress)
      setSelection(
        data.item.siteLat != null && data.item.siteLng != null
          ? { label: data.item.siteAddress, lat: data.item.siteLat, lng: data.item.siteLng }
          : null,
      )
      setSiteHours(String(data.item.siteHours))
      setCustomHours(!SITE_HOUR_PRESETS.includes(data.item.siteHours as typeof SITE_HOUR_PRESETS[number]))
      setResult(data.result)
      setShowSaved(false)
      toast("Calculation loaded", "success")
    } catch {
      toast("Could not load calculation", "error")
    }
  }

  const deleteSaved = async (id: string) => {
    try {
      await fetch(`/api/site-visit-calculator/saved/${id}`, { method: "DELETE" })
      loadSaved()
      toast("Deleted", "success")
    } catch {
      toast("Delete failed", "error")
    }
  }

  return (
    <PageShell>
      <div className="site-visit-no-print">
          <PageHeader
            title="Site Visit Calculator"
            description="Estimate travel and site visit costs from the ORYX office (return journey included)."
            actions={
              <Button variant="outline" size="sm" onClick={() => setShowSaved(v => !v)}>
                <History className="h-4 w-4 mr-1.5" />
                Saved ({saved.length})
              </Button>
            }
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div className="space-y-6">
              <DataPanel className={`${surfaceCard} p-6 space-y-5`}>
                <div>
                  <Label className="flex items-center gap-1.5 text-t2">
                    <Building2 className="h-4 w-4" /> Office (start & end)
                  </Label>
                  <p className="mt-1.5 text-sm text-t1">{ORYX_OFFICE.addressLine}</p>
                </div>

                <AddressAutocomplete
                  value={siteAddress}
                  onChange={setSiteAddress}
                  onSelect={setSelection}
                  disabled={loading}
                />

                <div>
                  <Label htmlFor="site-hours">Time on site</Label>
                  {!customHours ? (
                    <Select
                      value={siteHours}
                      onValueChange={v => {
                        if (v === "custom") {
                          setCustomHours(true)
                          return
                        }
                        setSiteHours(v)
                      }}
                    >
                      <SelectTrigger id="site-hours" className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SITE_HOUR_PRESETS.map(h => (
                          <SelectItem key={h} value={String(h)}>
                            {h === 1 ? "1 hour" : `${h} hours`}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">Custom…</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="mt-1.5 flex gap-2">
                      <Input
                        id="site-hours"
                        type="number"
                        min={0.5}
                        max={24}
                        step={0.5}
                        value={siteHours}
                        onChange={e => setSiteHours(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setCustomHours(false)
                          setSiteHours(String(DEFAULT_SITE_HOURS))
                        }}
                      >
                        Presets
                      </Button>
                    </div>
                  )}
                </div>
              </DataPanel>

              {showSaved && (
                <DataPanel className="p-0">
                  <div className="px-4 py-3 border-b border-bd font-semibold text-sm text-t1">
                    Saved calculations
                  </div>
                  {saved.length === 0 ? (
                    <p className="p-4 text-sm text-t3">No saved calculations yet.</p>
                  ) : (
                    <ul className="divide-y divide-bd max-h-64 overflow-auto">
                      {saved.map(item => (
                        <li key={item.id} className="flex items-center gap-2 px-4 py-3 text-sm">
                          <button
                            type="button"
                            className="flex-1 text-left min-w-0"
                            onClick={() => loadSavedItem(item.id)}
                          >
                            <p className="font-medium text-t1 truncate">
                              {item.label || item.siteAddress}
                            </p>
                            <p className="text-t3 text-xs truncate">
                              {formatGBP(item.grandTotal)}
                              {item.createdByName ? ` · ${item.createdByName}` : ""}
                              {" · "}
                              {new Date(item.createdAt).toLocaleDateString("en-GB")}
                            </p>
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label="Delete"
                            onClick={() => deleteSaved(item.id)}
                          >
                            <Trash2 className="h-4 w-4 text-t3" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </DataPanel>
              )}
            </div>

            <div className="space-y-4 lg:sticky lg:top-4">
              <CalculationSummary result={result} loading={loading} error={error} />

              {result && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={copySummary}>
                    <Copy className="h-4 w-4 mr-1.5" /> Copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={printSummary}>
                    <Printer className="h-4 w-4 mr-1.5" /> Print
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportPdf}>
                    <Download className="h-4 w-4 mr-1.5" /> PDF
                  </Button>
                  <div className="flex flex-1 min-w-[200px] gap-2">
                    <Input
                      placeholder="Label (optional)"
                      value={saveLabel}
                      onChange={e => setSaveLabel(e.target.value)}
                      className="h-9"
                    />
                    <Button size="sm" onClick={saveCalculation}>
                      <Save className="h-4 w-4 mr-1.5" /> Save
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="site-visit-print-only">
          <CalculationSummary result={result} />
        </div>
      </PageShell>
  )
}
