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
export const WORK_ITEM_TYPES = [
  {
    value:       "DESIGN",
    label:       "Design",
    shortLabel:  "Design",
    icon:        "PenLine",
    requiresDrawingNumber: true,
    requiresTypeOfWorks:   true,
    refPrefix:   null,
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
    color:       "bg-tag-catiii-bg text-tag-catiii",
    dot:         "bg-tag-catiii",
  },
] as const

export type WorkItemTypeValue = (typeof WORK_ITEM_TYPES)[number]["value"]
export const VALID_ITEM_TYPES = WORK_ITEM_TYPES.map(t => t.value)

export function getWorkItemType(v: string) {
  return WORK_ITEM_TYPES.find(t => t.value === v) ?? WORK_ITEM_TYPES[0]
}

/** Yearly reference prefixes for non-drawing service item types (SV-2026-001, etc.) */
export const REF_PREFIX_BY_ITEM_TYPE = Object.fromEntries(
  WORK_ITEM_TYPES.filter(t => t.refPrefix).map(t => [t.value, t.refPrefix!]),
) as Record<string, string>

export function getWorkItemRefHint(itemType: string): string {
  if (itemType === "DESIGN") return "YY/ORYX/MM/NNN"
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
