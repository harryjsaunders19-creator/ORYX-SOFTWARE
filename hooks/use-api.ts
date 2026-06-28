import useSWR, { type SWRConfiguration, mutate as globalMutate } from "swr"

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

const DEFAULT_OPTS: SWRConfiguration = {
  keepPreviousData: true,
  revalidateOnFocus: true,
  dedupingInterval: 3_000,
  errorRetryCount: 2,
}

/** Cached GET with stale-while-revalidate — aligns with API Cache-Control headers. */
export function useApi<T>(key: string | null, config?: SWRConfiguration) {
  return useSWR<T>(key, fetcher, { ...DEFAULT_OPTS, ...config })
}

/** Revalidate every SWR key whose string starts with `prefix`. */
export function revalidatePrefix(prefix: string) {
  return globalMutate(
    key => typeof key === "string" && key.startsWith(prefix),
    undefined,
    { revalidate: true },
  )
}

export { globalMutate as mutateApi }
