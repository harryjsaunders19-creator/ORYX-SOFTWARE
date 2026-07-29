"use client"

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  startTransition,
} from "react"
import { useRouter } from "next/navigation"
import {
  Search, X, Loader2, Briefcase, GitBranch, Building2,
  FileText, Receipt, Users, Clock, CalendarDays, IdCard,
} from "lucide-react"
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from "@/shared/ui/dialog"
import { useUser } from "@/shared/providers/user-context"
import { cn } from "@/shared/utils"
import { highlightParts } from "../rank"
import type { GlobalSearchResult, SearchEntityType, SearchHit } from "../types"

const DEBOUNCE_MS = 250
const RECENT_KEY = "oryx-global-search-recent"
const MAX_RECENT = 8

type RecentEntry = { q: string; at: number }

const TYPE_ICON: Record<SearchEntityType, React.ElementType> = {
  job: Briefcase,
  revision: GitBranch,
  client: Building2,
  quote: FileText,
  invoice: Receipt,
  calendar: CalendarDays,
  employee: IdCard,
  user: Users,
}

const TYPE_LABEL: Record<SearchEntityType, string> = {
  job: "Job",
  revision: "Revision",
  client: "Client",
  quote: "Quote",
  invoice: "Invoice",
  calendar: "Event",
  employee: "Employee",
  user: "User",
}

function readRecent(userId: string | undefined): RecentEntry[] {
  if (typeof window === "undefined" || !userId) return []
  try {
    const raw = localStorage.getItem(`${RECENT_KEY}:${userId}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentEntry[]
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

function writeRecent(userId: string, q: string) {
  const trimmed = q.trim()
  if (!trimmed) return
  const prev = readRecent(userId).filter(e => e.q.toLowerCase() !== trimmed.toLowerCase())
  const next = [{ q: trimmed, at: Date.now() }, ...prev].slice(0, MAX_RECENT)
  localStorage.setItem(`${RECENT_KEY}:${userId}`, JSON.stringify(next))
}

function Highlight({ text, query }: { text: string; query: string }) {
  const parts = highlightParts(text, query)
  return (
    <>
      {parts.map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded-sm bg-ac-bg text-ac font-semibold px-0.5">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  )
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const router = useRouter()
  const { user } = useUser()
  const userId = user?.id
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GlobalSearchResult | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const [recentsLoading, setRecentsLoading] = useState(false)
  const [recentJobs, setRecentJobs] = useState<SearchHit[]>([])
  const [recentClients, setRecentClients] = useState<SearchHit[]>([])

  const flatItems = useMemo(
    () => result?.groups.flatMap(g => g.items) ?? [],
    [result],
  )

  const close = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  const navigateTo = useCallback((hit: SearchHit, q: string) => {
    if (userId) writeRecent(userId, q || hit.title)
    close()
    router.push(hit.href)
  }, [close, router, userId])

  // Reset + focus when opened
  useEffect(() => {
    if (!open) return
    setQuery("")
    setResult(null)
    setActiveIndex(0)
    setRecent(readRecent(userId))
    const t = window.setTimeout(() => inputRef.current?.focus(), 10)
    return () => window.clearTimeout(t)
  }, [open, userId])

  // Empty-state recents from list APIs
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setRecentsLoading(true)
    ;(async () => {
      try {
        const [jobsRes, clientsRes] = await Promise.all([
          fetch("/api/jobs?page=1&limit=5", { cache: "no-store" }),
          fetch("/api/clients?page=1&limit=5", { cache: "no-store" }),
        ])
        if (cancelled) return
        if (jobsRes.ok) {
          const body = await jobsRes.json() as { jobs?: Array<{
            id: string; drawingNumber: string; clientCompany?: string; address?: string; status?: string
          }> }
          setRecentJobs((body.jobs ?? []).map(j => ({
            id: j.id,
            type: "job" as const,
            title: j.drawingNumber,
            subtitle: [j.clientCompany, j.address].filter(Boolean).join(" · "),
            href: `/jobs/${j.id}`,
            meta: j.status,
            score: 0,
          })))
        }
        if (clientsRes.ok) {
          const body = await clientsRes.json() as { clients?: Array<{
            id: string; name: string; contactName?: string | null; email?: string | null
          }> }
          setRecentClients((body.clients ?? []).map(c => ({
            id: c.id,
            type: "client" as const,
            title: c.name,
            subtitle: [c.contactName, c.email].filter(Boolean).join(" · "),
            href: `/clients/${c.id}`,
            score: 0,
          })))
        }
      } catch {
        /* ignore — empty state is optional */
      } finally {
        if (!cancelled) setRecentsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setResult(null)
      setLoading(false)
      abortRef.current?.abort()
      return
    }

    setLoading(true)
    const timer = window.setTimeout(() => {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      fetch(`/api/search?q=${encodeURIComponent(q)}&limit=24`, { signal: ac.signal, cache: "no-store" })
        .then(async res => {
          if (!res.ok) throw new Error("search failed")
          return res.json() as Promise<GlobalSearchResult>
        })
        .then(data => {
          startTransition(() => {
            setResult(data)
            setActiveIndex(0)
            setLoading(false)
          })
        })
        .catch(err => {
          if ((err as Error).name === "AbortError") return
          setLoading(false)
          setResult({ query: q, groups: [], total: 0, tookMs: 0 })
        })
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [query, open])

  const emptyMode = query.trim().length < 2
  const showNoResults = !emptyMode && !loading && result != null && result.total === 0

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      close()
      return
    }
    if (emptyMode) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, Math.max(flatItems.length - 1, 0)))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const hit = flatItems[activeIndex]
      if (hit) navigateTo(hit, query)
    }
  }

  let flatCursor = -1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        className="max-w-[640px] p-0 gap-0 overflow-hidden max-md:max-w-[calc(100vw-1rem)] max-md:max-h-[90vh]"
        onKeyDown={onKeyDown}
      >
        <DialogTitle className="sr-only">Global search</DialogTitle>
        <DialogDescription className="sr-only">
          Search jobs, clients, quotes, and more. Use arrow keys to navigate.
        </DialogDescription>

        <div className="flex items-center gap-2 border-b border-bd px-4 py-3 pr-12">
          <Search className="h-4 w-4 shrink-0 text-t4" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search jobs, clients and documents…"
            className="min-w-0 flex-1 bg-transparent text-sm text-t1 placeholder:text-t4 outline-none"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              flatItems[activeIndex] ? `${listId}-item-${activeIndex}` : undefined
            }
            role="combobox"
            aria-expanded
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); inputRef.current?.focus() }}
              className="rounded p-1 text-t4 hover:bg-surface-low hover:text-t1"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-t4" aria-hidden />}
          <kbd className="hidden sm:inline-flex shrink-0 rounded border border-bd bg-pg px-1.5 py-0.5 type-badge text-t4">
            Esc
          </kbd>
        </div>

        <div id={listId} role="listbox" className="max-h-[min(60vh,420px)] overflow-y-auto thin-scroll py-2">
          {emptyMode && (
            <div className="space-y-4 px-2 pb-2">
              {recent.length > 0 && (
                <section>
                  <p className="px-3 py-1.5 type-label text-t3 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> Recent searches
                  </p>
                  <ul className="space-y-0.5">
                    {recent.map(r => (
                      <li key={r.q}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-t2 hover:bg-surface-low"
                          onClick={() => setQuery(r.q)}
                        >
                          <Search className="h-3.5 w-3.5 text-t4" />
                          {r.q}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {recentsLoading ? (
                <p className="px-3 py-6 text-center text-xs text-t4">Loading recent…</p>
              ) : (
                <>
                  {recentJobs.length > 0 && (
                    <section>
                      <p className="px-3 py-1.5 type-label text-t3">
                        Recent jobs
                      </p>
                      <ul className="space-y-0.5">
                        {recentJobs.map(hit => {
                          const Icon = TYPE_ICON[hit.type]
                          return (
                            <li key={hit.id}>
                              <button
                                type="button"
                                className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-low"
                                onClick={() => navigateTo(hit, hit.title)}
                              >
                                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-t4" />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-semibold text-t1 type-drawing-number">{hit.title}</span>
                                  {hit.subtitle && (
                                    <span className="block truncate text-xs text-t3">{hit.subtitle}</span>
                                  )}
                                </span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  )}
                  {recentClients.length > 0 && (
                    <section>
                      <p className="px-3 py-1.5 type-label text-t3">
                        Recent clients
                      </p>
                      <ul className="space-y-0.5">
                        {recentClients.map(hit => {
                          const Icon = TYPE_ICON[hit.type]
                          return (
                            <li key={hit.id}>
                              <button
                                type="button"
                                className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-low"
                                onClick={() => navigateTo(hit, hit.title)}
                              >
                                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-t4" />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-semibold text-t1">{hit.title}</span>
                                  {hit.subtitle && (
                                    <span className="block truncate text-xs text-t3">{hit.subtitle}</span>
                                  )}
                                </span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  )}
                  {!recent.length && !recentJobs.length && !recentClients.length && (
                    <p className="px-3 py-8 text-center text-sm text-t4">
                      Type to search the whole system
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {!emptyMode && showNoResults && (
            <p className="px-4 py-10 text-center text-sm text-t4">
              No results found for “{query.trim()}”
            </p>
          )}

          {!emptyMode && result && result.groups.map(group => (
            <section key={group.type} className="mb-1">
              <p className="px-4 py-1.5 type-label text-t3">
                {group.label}
              </p>
              <ul className="space-y-0.5 px-2">
                {group.items.map(hit => {
                  flatCursor += 1
                  const index = flatCursor
                  const Icon = TYPE_ICON[hit.type]
                  const active = index === activeIndex
                  return (
                    <li key={`${hit.type}-${hit.id}`} role="option" aria-selected={active}>
                      <button
                        type="button"
                        id={`${listId}-item-${index}`}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                          active ? "bg-ac-bg" : "hover:bg-surface-low",
                        )}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => navigateTo(hit, query)}
                      >
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-bd bg-sr">
                          <Icon className="h-4 w-4 text-t2" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="type-label text-t3">
                              {TYPE_LABEL[hit.type]}
                            </span>
                            {hit.meta && (
                              <span className="type-badge text-t4 truncate">
                                {hit.meta}
                              </span>
                            )}
                          </span>
                          <span className={cn(
                            "block text-sm font-semibold text-t1",
                            (hit.type === "job" || hit.type === "revision" || hit.type === "quote") && "type-drawing-number",
                          )}>
                            <Highlight text={hit.title} query={query} />
                          </span>
                          {hit.subtitle && (
                            <span className="block truncate text-xs text-t3">
                              <Highlight text={hit.subtitle} query={query} />
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-bd bg-surface-low px-4 py-2 type-helper text-t4">
          <span className="flex items-center gap-3">
            <span><kbd className="rounded border border-bd bg-sr px-1">↑↓</kbd> navigate</span>
            <span><kbd className="rounded border border-bd bg-sr px-1">↵</kbd> open</span>
          </span>
          {result && result.total > 0 && (
            <span>{result.total} result{result.total === 1 ? "" : "s"} · {result.tookMs}ms</span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
