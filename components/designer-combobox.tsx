"use client"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

interface Props {
  value:      string
  onChange:   (name: string) => void
  placeholder?: string
  disabled?:  boolean
  className?: string
  autoFocus?: boolean
}

/** Free-text designer field with a typeahead dropdown of names already used elsewhere in the
 *  system — picking one is a single click; typing a brand-new name works exactly like a plain
 *  text input, no extra confirmation step (unlike clients, a designer name isn't a backing
 *  record, so there's nothing to "create"). */
export function DesignerCombobox({ value, onChange, placeholder, disabled, className, autoFocus }: Props) {
  const [designers, setDesigners] = useState<string[]>([])
  const [open,       setOpen]      = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch("/api/jobs/designers")
      .then(r => r.json() as Promise<{ designers: string[] }>)
      .then(d => setDesigners(d.designers))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])

  const matches = designers.filter(d =>
    d.toLowerCase() !== value.trim().toLowerCase() &&
    (value.trim() === "" || d.toLowerCase().includes(value.trim().toLowerCase()))
  ).slice(0, 6)

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder ?? "e.g. Sarah Mitchell"}
        autoComplete="off"
        className="flex h-8 w-full rounded border border-bd bg-sr px-3 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-ac focus:border-bds disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          height: "32px", width: "100%", borderRadius: "6px",
          border: "1px solid var(--color-bd)", backgroundColor: "var(--color-sr)",
          paddingLeft: "12px", paddingRight: "12px", fontSize: "14px", color: "var(--color-t1)", outline: "none",
        }}
        onKeyDown={e => { if (e.key === "Escape") setOpen(false) }}
      />
      {open && matches.length > 0 && (
        <div
          className="absolute z-[200] mt-1 w-full rounded border border-bd bg-sr shadow-card overflow-hidden"
          style={{
            position: "absolute", zIndex: 200, marginTop: "4px", width: "100%",
            borderRadius: "6px", border: "1px solid var(--color-bd)", backgroundColor: "var(--color-sr)",
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04)",
            overflow: "hidden",
          }}
        >
          <ul className="max-h-44 overflow-y-auto thin-scroll">
            {matches.map(d => (
              <li key={d}>
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); onChange(d); setOpen(false) }}
                  className="w-full flex items-center px-3 py-2 text-left text-sm text-t1 hover:bg-pg"
                >
                  {d}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
