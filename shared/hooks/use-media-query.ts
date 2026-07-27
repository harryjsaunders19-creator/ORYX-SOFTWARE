"use client"

import { useCallback, useSyncExternalStore } from "react"

function subscribeToMediaQuery(query: string, onChange: () => void): () => void {
  const mq = window.matchMedia(query)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

/** Subscribe to a CSS media query; returns false during SSR. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => subscribeToMediaQuery(query, onChange),
    [query],
  )
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  const getServerSnapshot = useCallback(() => false, [])
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * Same as useMediaQuery, plus `ready` which is false until the client has measured.
 * Use `ready` to avoid painting the wrong mobile/desktop branch before hydration.
 */
export function useClientMediaQuery(query: string): { matches: boolean; ready: boolean } {
  const matches = useMediaQuery(query)
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  return { matches, ready }
}
