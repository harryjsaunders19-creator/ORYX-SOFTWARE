/** Broadcast when a revision chain changes so open detail panels can refetch. */
export const REVISIONS_CHANGED = "oryx:revisions-changed"

export function notifyRevisionsChanged(parentJobId: string) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent(REVISIONS_CHANGED, { detail: { parentJobId } }),
  )
}
