"use client"
import { useEffect, useRef, useState, useCallback } from "react"
import { Search, Plus, X, Building2 } from "lucide-react"
import { cn } from "@/shared/utils/utils"
import type { Client } from "@/lib/types"

type ClientWithHold = Client & { onHold?: boolean; holdReason?: string | null }

interface Props {
  value:      string       // clientId currently selected
  name:       string       // display name (clientCompany)
  onChange:   (clientId: string, clientName: string, onHold?: boolean, holdReason?: string | null, contactName?: string | null) => void
  onCreateNew?: (name: string) => void
  disabled?:  boolean
  className?: string
}

export function ClientCombobox({ value, name, onChange, onCreateNew, disabled, className }: Props) {
  const [query,    setQuery]    = useState(name)      // text in the input
  const [results,  setResults]  = useState<ClientWithHold[]>([])
  const [open,     setOpen]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [selected, setSelected] = useState(!!value)   // a client row is confirmed

  const inputRef   = useRef<HTMLInputElement>(null)
  const dropRef    = useRef<HTMLDivElement>(null)

  // Sync display when controlled value changes
  useEffect(() => {
    setQuery(name)
    setSelected(!!value)
  }, [value, name])

  const search = useCallback(async (q: string, signal?: AbortSignal) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/clients/search?q=${encodeURIComponent(q)}&limit=8`, { signal })
      if (res.ok) {
        const d = await res.json() as { clients: ClientWithHold[] }
        setResults(d.clients)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const ac = new AbortController()
    const t = setTimeout(() => { void search(query, ac.signal) }, 150)
    return () => { clearTimeout(t); ac.abort() }
  }, [query, open, search])

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setOpen(false)
        // If nothing selected, reset to previous confirmed value
        if (!selected) setQuery(name)
      }
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [selected, name])

  const select = (client: ClientWithHold) => {
    setQuery(client.name)
    setSelected(true)
    setOpen(false)
    onChange(client.id, client.name, client.onHold, client.holdReason, client.contactName)
  }

  const clear = () => {
    setQuery("")
    setSelected(false)
    onChange("", "")
    inputRef.current?.focus()
    setOpen(true)
    search("")
  }

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setQuery(v)
    setSelected(false)
    setOpen(true)
  }

  const handleFocus = () => {
    if (!selected) {
      setOpen(true)
      search(query)
    }
  }

  const noMatch = !loading && results.length === 0 && query.trim().length > 0

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-t4 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={handleFocus}
          disabled={disabled}
          placeholder="Search or type client name…"
          autoComplete="off"
          className={cn(
            "flex h-9 w-full rounded-lg border border-bd bg-sr pl-8 pr-8 text-sm text-t1",
            "placeholder:text-t4",
            "focus:outline-none focus:ring-2 focus:ring-ac/20 focus:border-ac",
            "disabled:cursor-not-allowed disabled:opacity-50",
            selected && "border-bds",
          )}
          style={{
            height: "36px", width: "100%", borderRadius: "var(--radius-lg)",
            border: selected ? "1px solid var(--color-bds)" : "1px solid var(--color-bd)",
            backgroundColor: "var(--color-sr)", paddingLeft: "32px", paddingRight: "32px",
            fontSize: "14px", color: "var(--color-t1)", outline: "none",
          }}
          onKeyDown={e => {
            if (e.key === "Escape") { setOpen(false); if (!selected) setQuery(name) }
            if (e.key === "Enter" && results.length === 1) { e.preventDefault(); select(results[0]) }
          }}
        />
        {query && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-t4 hover:text-t2"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div
          ref={dropRef}
          className="absolute z-[200] mt-1 w-full rounded border border-bd bg-sr shadow-card overflow-hidden"
          style={{
            position: "absolute", zIndex: 200, marginTop: "4px", width: "100%",
            borderRadius: "6px", border: "1px solid var(--color-bd)",
            backgroundColor: "var(--color-sr)",
            boxShadow: "var(--shadow-card)",
            overflow: "hidden",
          }}
        >
          {loading ? (
            <div className="px-3 py-2.5 text-xs text-t4">Searching…</div>
          ) : results.length > 0 ? (
            <ul className="max-h-48 overflow-y-auto thin-scroll">
              {results.map(c => (
                <li key={c.id}>
                  <button
                    type="button"
                    onMouseDown={e => { e.preventDefault(); select(c) }}
                    className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm", c.onHold ? "bg-dn-bg hover:bg-dn-bg/70" : "hover:bg-pg")}
                  >
                    <Building2 className={cn("h-3.5 w-3.5 shrink-0", c.onHold ? "text-dn" : "text-t4")} />
                    <div className="flex-1 min-w-0">
                      <span className={cn("font-medium truncate block", c.onHold ? "text-dn-tx" : "text-t1")}>{c.name}</span>
                      {c.onHold && <span className="type-helper text-dn font-medium">⚠ ON HOLD</span>}
                    </div>
                    {c.contactName && !c.onHold && (
                      <span className="text-t4 text-xs truncate ml-auto shrink-0">{c.contactName}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : noMatch ? (
            <div className="px-3 py-2 text-xs text-t3">
              No client found for &ldquo;{query}&rdquo;
            </div>
          ) : null}

          {/* Create new client option */}
          {onCreateNew && query.trim() && !selected && (
            <div className="border-t border-bd">
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); setOpen(false); onCreateNew(query.trim()) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-ac hover:bg-pg font-medium"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                Create &ldquo;{query.trim()}&rdquo; as new client
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
