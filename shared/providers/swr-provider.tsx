"use client"
import { SWRConfig } from "swr"
import { apiFetch } from "@/shared/hooks/use-api"

async function fetcher<T>(url: string): Promise<T> {
  const res = await apiFetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{
      fetcher,
      keepPreviousData: true,
      revalidateOnFocus: false,
      dedupingInterval: 2_000,
      errorRetryCount: 2,
    }}>
      {children}
    </SWRConfig>
  )
}
