"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"

export interface AddressSelection {
  label: string
  lat: number
  lng: number
}

interface AddressAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSelect: (selection: AddressSelection | null) => void
  disabled?: boolean
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  disabled,
}: AddressAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<AddressSelection[]>([])
  const [loading, setLoading] = useState(false)
  const debounced = useDebouncedValue(value, 350)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (debounced.trim().length < 2) {
      setResults([])
      return
    }
    const ac = new AbortController()
    setLoading(true)
    fetch(`/api/job-map/search?q=${encodeURIComponent(debounced.trim())}`, { signal: ac.signal })
      .then(r => r.json())
      .then(data => {
        setResults((data.results ?? []).map((r: AddressSelection) => r))
      })
      .catch(err => {
        if (err instanceof DOMException && err.name === "AbortError") return
        setResults([])
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })
    return () => ac.abort()
  }, [debounced])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [])

  const pick = useCallback((item: AddressSelection) => {
    onChange(item.label)
    onSelect(item)
    setOpen(false)
  }, [onChange, onSelect])

  return (
    <div ref={containerRef} className="relative">
      <Label htmlFor="site-address">Site address</Label>
      <Input
        id="site-address"
        value={value}
        disabled={disabled}
        placeholder="Postcode or full address"
        className="mt-1.5"
        onChange={e => {
          onChange(e.target.value)
          onSelect(null)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && (results.length > 0 || loading) && (
        <ul className="absolute z-20 mt-1 w-full rounded-md border border-bd bg-sr shadow-lg max-h-48 overflow-auto">
          {loading && (
            <li className="px-3 py-2 text-sm text-t3">Searching…</li>
          )}
          {results.map((r, i) => (
            <li key={`${r.lat}-${r.lng}-${i}`}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-t1 hover:bg-pg"
                onClick={() => pick(r)}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
