"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import { Check, ChevronDown } from "lucide-react"

export interface AddressSelection {
  label: string
  lat: number
  lng: number
}

interface AddressAutocompleteProps {
  value: string
  selected: AddressSelection | null
  onChange: (value: string) => void
  onSelect: (selection: AddressSelection | null) => void
  disabled?: boolean
}

export function AddressAutocomplete({
  value,
  selected,
  onChange,
  onSelect,
  disabled,
}: AddressAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<AddressSelection[]>([])
  const [loading, setLoading] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const debounced = useDebouncedValue(value, 350)
  const containerRef = useRef<HTMLDivElement>(null)
  const listboxId = "site-address-listbox"
  const isConfirmed = selected != null && selected.label === value

  useEffect(() => {
    if (debounced.trim().length < 2) {
      setResults([])
      setRequestError(null)
      return
    }
    const ac = new AbortController()
    setLoading(true)
    setRequestError(null)
    fetch(`/api/site-visit-calculator/search?q=${encodeURIComponent(debounced.trim())}`, { signal: ac.signal })
      .then(async r => {
        if (!r.ok) {
          throw new Error("Address lookup failed")
        }
        return r.json()
      })
      .then(data => {
        setResults((data.results ?? []).map((r: AddressSelection) => r))
      })
      .catch(err => {
        if (err instanceof DOMException && err.name === "AbortError") return
        setResults([])
        setRequestError("Address lookup is unavailable right now. Please try again.")
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

  const showDropdown = open && value.trim().length >= 2

  return (
    <div ref={containerRef} className="relative">
      <Label htmlFor="site-address">Site address</Label>
      <p className="mt-1 text-xs text-t3">
        Type to search, then choose an address from the list below.
      </p>
      <div className="relative mt-1.5">
        <Input
          id="site-address"
          value={value}
          disabled={disabled}
          placeholder="Postcode or full address"
          className={isConfirmed ? "pr-9 border-ac/40" : "pr-9"}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          onChange={e => {
            onChange(e.target.value)
            onSelect(null)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
        />
        {isConfirmed ? (
          <Check className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ac" />
        ) : (
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t3" />
        )}
      </div>
      {showDropdown && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Address suggestions"
          className="absolute z-20 mt-1 w-full rounded-md border border-bd bg-sr shadow-lg max-h-56 overflow-auto"
        >
          {loading && (
            <li className="px-3 py-2 text-sm text-t3" role="presentation">
              Searching addresses…
            </li>
          )}
          {!loading && results.length === 0 && (
            <li className="px-3 py-2 text-sm text-t3" role="presentation">
              No matching addresses — try a postcode or more detail.
            </li>
          )}
          {!loading &&
            results.map((r, i) => (
              <li key={`${r.lat}-${r.lng}-${i}`} role="option" aria-selected={selected?.label === r.label}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 text-sm text-t1 hover:bg-hover-surface focus:bg-hover-surface focus:outline-none"
                  onClick={() => pick(r)}
                >
                  {r.label}
                </button>
              </li>
            ))}
        </ul>
      )}
      {!isConfirmed && value.trim().length > 0 && (
        <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
          Select an address from the list to calculate the visit cost.
        </p>
      )}
      {requestError && (
        <p className="mt-1.5 text-xs text-danger">
          {requestError}
        </p>
      )}
    </div>
  )
}
