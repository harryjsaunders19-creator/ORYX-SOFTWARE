import useSWR, { type KeyedMutator, type SWRConfiguration, mutate as globalMutate } from "swr"

/** Bypass browser HTTP cache — API routes are private and mutate frequently. */
export function apiFetch(url: string, init?: RequestInit) {
  return fetch(url, { ...init, cache: "no-store" })
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await apiFetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

const DEFAULT_OPTS: SWRConfiguration = {
  keepPreviousData: true,
  revalidateOnFocus: false,
  dedupingInterval: 2_000,
  errorRetryCount: 2,
}

/**
 * Build a stable SWR/API key from a path + query params.
 * Omits null/undefined/empty-string values; booleans become "true"/"false".
 */
export function buildApiKey(
  path: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): string {
  if (!params) return path
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue
    qs.set(key, typeof value === "boolean" ? (value ? "true" : "false") : String(value))
  }
  const s = qs.toString()
  return s ? `${path}?${s}` : path
}

/**
 * Cached GET with stale-while-revalidate — aligns with API Cache-Control headers.
 * Pass a module-level / memoized `config` object when overriding defaults so SWR
 * does not see a new options identity every render.
 */
export function useApi<T>(key: string | null, config?: SWRConfiguration) {
  // Prefer the stable DEFAULT_OPTS reference when callers pass no overrides.
  return useSWR<T>(key, fetcher, config ? { ...DEFAULT_OPTS, ...config } : DEFAULT_OPTS)
}

/** Revalidate every SWR key whose string starts with `prefix`. */
export function revalidatePrefix(prefix: string) {
  return globalMutate(
    key => typeof key === "string" && key.startsWith(prefix),
    undefined,
    { revalidate: true },
  )
}

type ListKey = "jobs" | "clients" | "quotes"

function listFromCache(current: unknown, listKey: ListKey): { id: string }[] | null {
  if (!current || typeof current !== "object") return null
  const list = (current as Record<string, unknown>)[listKey]
  return Array.isArray(list) ? list as { id: string }[] : null
}

/** Drop a row from a paginated list cache immediately, then revalidate in background. */
export function optimisticListRemove<Data>(
  mutate: KeyedMutator<Data>,
  listKey: ListKey,
  id: string,
) {
  return mutate(
    (current) => {
      const list = listFromCache(current, listKey)
      if (!list || current == null || typeof current !== "object") return current
      const next = list.filter(item => item.id !== id)
      if (next.length === list.length) return current
      const total = (current as { total?: number }).total
      return {
        ...(current as object),
        [listKey]: next,
        total: total != null ? Math.max(0, total - 1) : total,
      } as Data
    },
    { revalidate: true },
  )
}

/** Prepend a row to a paginated list cache, then revalidate in background. */
export function optimisticListPrepend<Data, T extends { id: string }>(
  mutate: KeyedMutator<Data>,
  listKey: ListKey,
  item: T,
) {
  return mutate(
    (current) => {
      const list = listFromCache(current, listKey)
      if (!list || current == null || typeof current !== "object") return current
      if (list.some(row => row.id === item.id)) return current
      const total = (current as { total?: number }).total
      return {
        ...(current as object),
        [listKey]: [item, ...list],
        total: (total ?? list.length) + 1,
      } as Data
    },
    { revalidate: true },
  )
}

export { globalMutate as mutateApi }
