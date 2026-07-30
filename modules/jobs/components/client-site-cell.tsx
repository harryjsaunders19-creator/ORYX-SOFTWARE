"use client"

import type { ReactNode } from "react"
import { MapPin } from "lucide-react"
import { cn } from "@/shared/utils/utils"

/** Highlight the first case-insensitive match of `query` inside `text`. */
export function highlightText(text: string, query?: string | null): ReactNode {
  const value = text || ""
  const q = query?.trim()
  if (!q || !value) return value || null

  const lower = value.toLowerCase()
  const needle = q.toLowerCase()
  const idx = lower.indexOf(needle)
  if (idx < 0) return value

  return (
    <>
      {value.slice(0, idx)}
      <mark className="rounded-[3px] bg-ac2-bg px-0.5 text-inherit dark:bg-ac2/25">
        {value.slice(idx, idx + q.length)}
      </mark>
      {value.slice(idx + q.length)}
    </>
  )
}

type ClientSiteCellProps = {
  clientName: string | null | undefined
  siteName: string | null | undefined
  /** Search query used to highlight matches. */
  highlightQuery?: string | null
  /**
   * `register` — table cell (truncate + tooltips)
   * `card` — mobile card (wrap)
   * `header` — inspector header
   * `compact` — dense lists (quote attach, etc.)
   */
  variant?: "register" | "card" | "header" | "compact"
  showSiteIcon?: boolean
  className?: string
  selected?: boolean
}

/**
 * Shared Client / Site hierarchy for Jobs register, mobile cards,
 * inspector header, and related selectors.
 */
export function ClientSiteCell({
  clientName,
  siteName,
  highlightQuery,
  variant = "register",
  showSiteIcon = true,
  className,
  selected = false,
}: ClientSiteCellProps) {
  const client = (clientName ?? "").trim() || "—"
  const site = (siteName ?? "").trim()
  const hasSite = Boolean(site) && site !== "—"
  const clientTitle = client !== "—" ? client : undefined
  const siteTitle = hasSite ? site : undefined

  const clientClass = cn(
    "font-semibold text-t1 transition-colors",
    variant === "register" && "truncate text-base leading-snug group-hover:text-t1",
    variant === "card" && "text-base leading-snug [overflow-wrap:anywhere]",
    variant === "header" && "text-[15px] leading-snug [overflow-wrap:anywhere]",
    variant === "compact" && "truncate text-sm leading-snug",
    selected && "text-t1",
  )

  const siteClass = cn(
    "flex min-w-0 items-center gap-1 text-t2 transition-colors",
    variant === "register" && "mt-1 truncate text-[13px] leading-snug group-hover:text-t1",
    variant === "card" && "mt-1 text-sm leading-snug [overflow-wrap:anywhere]",
    variant === "header" && "mt-1 text-sm leading-snug [overflow-wrap:anywhere]",
    variant === "compact" && "mt-0.5 truncate text-xs leading-snug",
    selected ? "text-t2" : "text-t2",
  )

  return (
    <div className={cn("min-w-0", className)}>
      <p className={clientClass} title={clientTitle}>
        {highlightText(client, highlightQuery)}
      </p>
      {hasSite ? (
        <p className={siteClass} title={siteTitle}>
          {showSiteIcon ? (
            <MapPin
              className={cn(
                "shrink-0 text-t3",
                variant === "compact" ? "h-3 w-3" : "h-3.5 w-3.5",
              )}
              aria-hidden
            />
          ) : null}
          <span className="min-w-0 truncate">{highlightText(site, highlightQuery)}</span>
        </p>
      ) : null}
    </div>
  )
}
