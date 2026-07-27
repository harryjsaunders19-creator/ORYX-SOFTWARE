import { useEffect, useState } from "react"

/** Returns `value` after it has been stable for `delayMs` milliseconds. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    if (Object.is(value, debounced)) return
    if (delayMs <= 0) {
      setDebounced(value)
      return
    }
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs, debounced])

  return debounced
}
