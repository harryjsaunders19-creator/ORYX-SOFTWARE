/** Client-persisted custom Type of Works labels (stored as Other + description on jobs). */
const STORAGE_KEY = "oryx-custom-works-types"

export function readCustomWorksTypes(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map(v => v.trim())
      .slice(0, 40)
  } catch {
    return []
  }
}

export function writeCustomWorksTypes(types: string[]): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(types.slice(0, 40)))
  } catch {
    /* quota / private mode */
  }
}

export function addCustomWorksType(label: string): string[] {
  const trimmed = label.trim()
  if (!trimmed) return readCustomWorksTypes()
  const prev = readCustomWorksTypes()
  const next = [trimmed, ...prev.filter(t => t.toLowerCase() !== trimmed.toLowerCase())]
  writeCustomWorksTypes(next)
  return next
}
