/** Parse a positive integer query param without yielding NaN. */
export function parsePositiveInt(raw: string | null | undefined, fallback: number): number {
  if (raw == null || raw === "") return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : fallback
}

/** Page number ≥ 1. */
export function parsePageParam(raw: string | null | undefined, fallback = 1): number {
  return Math.max(1, parsePositiveInt(raw, fallback))
}

/** Limit clamped to [1, max]. */
export function parseLimitParam(
  raw: string | null | undefined,
  fallback: number,
  max: number,
): number {
  const n = parsePositiveInt(raw, fallback)
  return Math.max(1, Math.min(max, n))
}
