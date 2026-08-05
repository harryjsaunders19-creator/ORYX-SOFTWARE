/** Client-safe helpers for job-derived calendar event ids. */

const DERIVED_PREFIX = "derived:job:"

export function isJobDerivedEventId(id: string): boolean {
  return id.startsWith(DERIVED_PREFIX)
}

export function jobIdFromDerivedEventId(id: string): string | null {
  if (!isJobDerivedEventId(id)) return null
  const parts = id.split(":")
  // derived:job:{kind}:{jobId}
  return parts[3] ?? null
}

export function makeJobDerivedEventId(kind: string, jobId: string): string {
  return `${DERIVED_PREFIX}${kind}:${jobId}`
}
