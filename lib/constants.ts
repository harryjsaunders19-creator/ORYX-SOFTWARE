// ── Job statuses ─────────────────────────────────────────────────
// Labels below are the simplified, accounts/ops-facing terminology. The
// underlying stored values (NEW_REQUEST/IN_DESIGN/CHECKING/READY_TO_SEND/ISSUED)
// are deliberately left unchanged in meaning where possible — they're referenced
// throughout the schema, every status filter, StatusHistory's permanent audit rows,
// and the ISSUED-gated billing-handoff and deadline-exclusion logic (§11/§19 of
// PROJECT_OVERVIEW.md). Renaming existing values would be a real data migration;
// new statuses are appended to the workflow before Complete (ISSUED).
export const JOB_STATUSES = [
  { value: "NEW_REQUEST",   label: "New Request",       shortLabel: "New",      dot: "bg-gy" },
  { value: "IN_DESIGN",     label: "In Progress",        shortLabel: "Progress", dot: "bg-yl" },
  { value: "CHECKING",      label: "Requires Checking",  shortLabel: "Checking", dot: "bg-wn" },
  { value: "READY_TO_SEND", label: "Ready to Send",      shortLabel: "Send",     dot: "bg-rs-ic" },
  { value: "ISSUED",        label: "Complete",           shortLabel: "Complete", dot: "bg-ok-ic" },
] as const

export type JobStatusValue = (typeof JOB_STATUSES)[number]["value"]
export const VALID_STATUSES = JOB_STATUSES.map(s => s.value)
export function getJobStatus(v: string) {
  return JOB_STATUSES.find(s => s.value === v) ?? JOB_STATUSES[0]
}

// ── Work item types ───────────────────────────────────────────────
// creatable:false keeps historical SURVEY/INSPECTION rows displayable and
// filterable, but hides them from the new-job type picker (ORYX does not
// offer those services).
export const WORK_ITEM_TYPES = [
  {
    value:       "DESIGN",
    label:       "Design",
    shortLabel:  "Design",
    icon:        "PenLine",
    requiresDrawingNumber: true,
    requiresTypeOfWorks:   true,
    refPrefix:   null,
    creatable:   true,
    color:       "bg-tag-design-bg text-tag-design",
    dot:         "bg-tag-design",
  },
  {
    value:       "REVISION",
    label:       "Revision",
    shortLabel:  "Rev",
    icon:        "GitBranch",
    requiresDrawingNumber: true,   // auto-generated from parent
    requiresTypeOfWorks:   false,
    refPrefix:   null,
    creatable:   false,            // created via POST /api/jobs/[id]/revisions
    color:       "bg-tag-revision-bg text-tag-revision",
    dot:         "bg-tag-revision",
  },
  {
    value:       "SITE_VISIT",
    label:       "Site Visit",
    shortLabel:  "SV",
    icon:        "MapPin",
    requiresDrawingNumber: false,  // uses SV-YYYY-NNN
    requiresTypeOfWorks:   false,
    refPrefix:   "SV",
    creatable:   true,
    color:       "bg-tag-sitevisit-bg text-tag-sitevisit",
    dot:         "bg-tag-sitevisit",
  },
  {
    value:       "SURVEY",
    label:       "Survey",
    shortLabel:  "Surv",
    icon:        "Clipboard",
    requiresDrawingNumber: false,  // uses SRV-YYYY-NNN
    requiresTypeOfWorks:   false,
    refPrefix:   "SRV",
    creatable:   false,
    color:       "bg-tag-survey-bg text-tag-survey",
    dot:         "bg-tag-survey",
  },
  {
    value:       "INSPECTION",
    label:       "Inspection",
    shortLabel:  "Insp",
    icon:        "Search",
    requiresDrawingNumber: false,  // uses INS-YYYY-NNN
    requiresTypeOfWorks:   false,
    refPrefix:   "INS",
    creatable:   false,
    color:       "bg-tag-inspection-bg text-tag-inspection",
    dot:         "bg-tag-inspection",
  },
  {
    value:       "CATIII_DESIGN_CHECK",
    label:       "CATIII Design Check",
    shortLabel:  "CATIII",
    icon:        "ShieldCheck",
    requiresDrawingNumber: false,  // uses CAT3-YYYY-NNN
    requiresTypeOfWorks:   false,
    refPrefix:   "CAT3",
    creatable:   true,
    color:       "bg-tag-catiii-bg text-tag-catiii",
    dot:         "bg-tag-catiii",
  },
] as const

export type WorkItemTypeValue = (typeof WORK_ITEM_TYPES)[number]["value"]
export const VALID_ITEM_TYPES = WORK_ITEM_TYPES.map(t => t.value)
/** Item types offered when creating a new job (excludes Revision / Survey / Inspection). */
export const CREATABLE_ITEM_TYPES = WORK_ITEM_TYPES.filter(t => t.creatable)
export const CREATABLE_ITEM_TYPE_VALUES = CREATABLE_ITEM_TYPES.map(t => t.value)

export function getWorkItemType(v: string) {
  return WORK_ITEM_TYPES.find(t => t.value === v) ?? WORK_ITEM_TYPES[0]
}

/** Yearly reference prefixes for non-drawing service item types (SV-2026-001, etc.) */
export const REF_PREFIX_BY_ITEM_TYPE = Object.fromEntries(
  WORK_ITEM_TYPES.filter(t => t.refPrefix).map(t => [t.value, t.refPrefix!]),
) as Record<string, string>

export function getWorkItemRefHint(itemType: string): string {
  if (itemType === "DESIGN") return "YY/ORYX/MM/NNN (NNN is global, no monthly reset)"
  const prefix = REF_PREFIX_BY_ITEM_TYPE[itemType]
  return prefix ? `${prefix}-YYYY-NNN` : ""
}

/** True for item types that don't need a drawing number entered by the user */
export function isNonDrawingType(itemType: string): boolean {
  const t = getWorkItemType(itemType)
  return !t.requiresDrawingNumber || itemType === "REVISION"
}

// ── Scaffold works types (used by Design + Revision only) ─────────
// This is the single source of truth for the controlled Type of Works list —
// referenced by the job form's combobox, server-side validation on every
// create/update route, and the legacy-value migration's target set. Adding
// or renaming an entry here is a real business decision (it changes what
// "valid" means for every existing and future job) — see
// PROJECT_OVERVIEW.md §22 before editing.
export const WORKS_TYPES = [
  "Access Scaffold",
  "Bridged Access",
  "Birdcage (Internal/External)",
  "Temporary Roof",
  "Loading Bay",
  "Freestanding Access",
  "Edge Protection",
  "Staircase / Tower",
  "Propping / Shoring",
  "Hoist Tower / Lifting Frame",
  "Crash Deck",
  "Access over Roof / Conservatory",
  "Gantry",
  "Cantilevered Scaffold",
  "Asbestos Enclosure",
  "Lift Shaft",
  "Yard Rack",
  "Other",
] as const

export type WorksType = typeof WORKS_TYPES[number]

/** The sentinel value that requires a customTypeDescription alongside it. */
export const OTHER_WORKS_TYPE: WorksType = "Other"

export function isValidWorksType(value: string): value is WorksType {
  return (WORKS_TYPES as readonly string[]).includes(value)
}

/**
 * Label shown in UI for a job/quote type of works.
 * Custom entries are stored as Other + description — never surface the
 * sentinel "Other" when a real description exists.
 */
export function worksTypeDisplayLabel(
  typeOfWorks: string | null | undefined,
  customTypeDescription?: string | null,
): string {
  const works = typeOfWorks?.trim() ?? ""
  if (!works) return ""
  if (works === OTHER_WORKS_TYPE) {
    const custom = customTypeDescription?.trim() ?? ""
    return custom || ""
  }
  return works
}

// ── Job tags (preset chips + free-text custom labels) ─────────────
export const JOB_TAGS = [
  "Temporary Roof",
  "Access Scaffold",
  "Raking Shore",
  "Flying Shore",
  "Dead Shore",
  "Network Rail",
  "Freestanding",
  "System Scaffold",
  "Truss Out",
  "Needled Shore",
  "Lift Shaft",
  "Birdcage",
  "Hoist Tower",
  "Gantry",
  "Loading Bay",
  "Public Access",
  "Listed Building",
] as const

export type JobTag = (typeof JOB_TAGS)[number]

/** Max length for a single job tag (preset or custom). */
export const JOB_TAG_MAX_LEN = 48

export function isValidJobTag(value: string): value is JobTag {
  return (JOB_TAGS as readonly string[]).includes(value)
}

/**
 * Normalise a tag for storage: trim, collapse whitespace, length-check.
 * Returns null when empty or too long.
 */
export function normalizeJobTag(value: string): string | null {
  const tag = value.trim().replace(/\s+/g, " ")
  if (!tag || tag.length > JOB_TAG_MAX_LEN) return null
  return tag
}

/** JOB_TAGS (plus exact free-text query) that fuzzy-match a search query. */
export function matchingJobTags(query: string): string[] {
  const raw = query.trim()
  const needle = raw.toLowerCase()
  if (needle.length < 2) return []
  const presets = JOB_TAGS.filter(tag => {
    const hay = tag.toLowerCase()
    if (hay === needle || hay.includes(needle) || needle.includes(hay)) return true
    return hay.split(/\s+/).some(tok => tok.startsWith(needle) || needle.startsWith(tok))
  })
  // Exact custom-tag search: overlap filter needs the literal stored value.
  if (raw && !presets.some(p => p.toLowerCase() === needle)) {
    return [...presets, raw]
  }
  return [...presets]
}

/** Parse tags from DB (Postgres text[] or SQLite JSON text) into a string[]. */
export function parseJobTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((t): t is string => typeof t === "string")
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter((t): t is string => typeof t === "string")
      }
    } catch { /* ignore malformed JSON */ }
  }
  return []
}

/**
 * Validate + dedupe an incoming tags payload (preset and custom).
 * Returns null when the value is not an array or contains an invalid tag
 * (caller should 422).
 */
export function sanitizeJobTags(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null
  const out: string[] = []
  for (const item of input) {
    if (typeof item !== "string") return null
    const normalized = normalizeJobTag(item)
    if (!normalized) return null
    const key = normalized.toLowerCase()
    if (out.some(t => t.toLowerCase() === key)) continue
    // Prefer canonical preset spelling when it matches case-insensitively.
    const preset = JOB_TAGS.find(p => p.toLowerCase() === key)
    out.push(preset ?? normalized)
  }
  return out
}

/** Serialize tags for SQLite TEXT storage. */
export function serializeJobTags(tags: string[] | null | undefined): string {
  return JSON.stringify(tags ?? [])
}

// ── Revision letters ──────────────────────────────────────────────
export const REVISION_LETTERS = [
  "A","B","C","D","E","F","G","H","I","J","K","L","M",
  "N","O","P","Q","R","S","T","U","V","W","X","Y","Z",
]

export function nextRevisionLetter(existing: string[]): string {
  for (const letter of REVISION_LETTERS) {
    if (!existing.includes(letter)) return letter
  }
  return "A"
}
