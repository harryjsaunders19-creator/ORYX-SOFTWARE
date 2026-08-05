"use client"
import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, Search } from "lucide-react"
import { cn } from "@/shared/utils"
import { WORKS_TYPES } from "@/lib/constants"

interface Props {
  value:      string                 // must be one of WORKS_TYPES, or ""
  onChange:   (value: string) => void
  disabled?:  boolean
  className?: string
  error?:     boolean
  id?:        string
}

/**
 * Searchable select for the controlled Type of Works list. Deliberately NOT
 * a free-text-with-suggestions field like DesignerCombobox — typing only
 * ever filters the dropdown, and the committed value can only change via an
 * explicit click on one of the approved entries. Closing the dropdown
 * without picking anything (Escape, clicking away, tabbing out) discards
 * whatever was typed and reverts the visible text to the current value, so
 * a half-typed search can never accidentally become the stored value.
 */
export function TypeOfWorksCombobox({ value, onChange, disabled, className, error, id }: Props) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState("")
  const wrapRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery("")
      }
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])

  const matches = query.trim() === ""
    ? WORKS_TYPES
    : WORKS_TYPES.filter(t => t.toLowerCase().includes(query.trim().toLowerCase()))

  const select = (t: string) => {
    onChange(t)
    setOpen(false)
    setQuery("")
  }

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => { setOpen(o => !o); requestAnimationFrame(() => inputRef.current?.focus()) }}
        className={cn(
          "flex h-8 w-full items-center justify-between rounded border bg-sr px-3 text-sm text-left",
          "focus:outline-none focus:ring-2 focus:ring-ac disabled:cursor-not-allowed disabled:opacity-50",
          error ? "border-dn" : "border-bd",
        )}
      >
        <span className={cn("truncate", value ? "text-t1" : "text-t4")}>
          {value || "Select type of works…"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-t4 shrink-0 ml-2" />
      </button>

      {open && (
        <div className="absolute z-[200] mt-1 w-full rounded border border-bd bg-sr shadow-card overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-bd">
            <Search className="h-3.5 w-3.5 text-t4 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search…"
              autoComplete="off"
              className="flex-1 text-sm outline-none placeholder:text-t4 bg-transparent"
              onKeyDown={e => {
                if (e.key === "Escape") { setOpen(false); setQuery("") }
                if (e.key === "Enter" && matches.length === 1) select(matches[0])
              }}
            />
          </div>
          <ul className="max-h-56 overflow-y-auto thin-scroll">
            {matches.length === 0 ? (
              <li className="px-3 py-3 text-xs text-t4 italic text-center">No matching type</li>
            ) : (
              matches.map(t => (
                <li key={t}>
                  <button
                    type="button"
                    onMouseDown={e => { e.preventDefault(); select(t) }}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-hover-surface",
                      t === value ? "text-ac font-medium" : "text-t1",
                    )}
                  >
                    {t}
                    {t === value && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
