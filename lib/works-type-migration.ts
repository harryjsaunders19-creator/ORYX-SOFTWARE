import { WORKS_TYPES, isValidWorksType } from "@/lib/constants"

/**
 * Maps known legacy/abbreviated spellings to their canonical approved value.
 * Deliberately an explicit dictionary, not a fuzzy/string-distance matcher —
 * every entry here is a human-reviewable judgement call, which a similarity
 * threshold isn't: "Crash Barrier" could fuzzy-match "Crash Deck" with high
 * confidence and be flatly wrong. Anything not listed here falls through to
 * manual review rather than being guessed at.
 *
 * Keys are matched case-insensitively after trimming and collapsing
 * whitespace — see normalize() below. Add new aliases here as real legacy
 * values turn up; this is the one place that needs editing to teach the
 * migration a new confident mapping.
 */
const ALIASES: Record<string, string> = {
  // Direct abbreviations / punctuation variants of an existing approved value
  "access scaff":            "Access Scaffold",
  "access scaffolding":      "Access Scaffold",
  "bird cage":               "Birdcage (Internal/External)",
  "birdcage":                "Birdcage (Internal/External)",
  "birdcage scaffold":       "Birdcage (Internal/External)",   // old controlled value
  "internal birdcage":       "Birdcage (Internal/External)",
  "external birdcage":       "Birdcage (Internal/External)",
  "temp roof":               "Temporary Roof",
  "temporary roofing":       "Temporary Roof",
  "staircase tower":         "Staircase / Tower",              // old controlled value
  "staircase":               "Staircase / Tower",
  "stair tower":             "Staircase / Tower",
  "propping & shoring":      "Propping / Shoring",             // old controlled value, punctuation only
  "propping and shoring":    "Propping / Shoring",
  "propping":                "Propping / Shoring",
  "shoring":                 "Propping / Shoring",
  "cantilever platform":     "Cantilevered Scaffold",          // old controlled value
  "cantilever scaffold":     "Cantilevered Scaffold",
  "cantilevered":            "Cantilevered Scaffold",
  "edge protection system":  "Edge Protection",
  "hoist tower":             "Hoist Tower / Lifting Frame",
  "lifting frame":           "Hoist Tower / Lifting Frame",
  "hoist":                   "Hoist Tower / Lifting Frame",
  "crash decking":           "Crash Deck",
  "asbestos enc":            "Asbestos Enclosure",
  "asbestos":                "Asbestos Enclosure",
  "lift shaft scaffold":     "Lift Shaft",
  "yard racking":            "Yard Rack",
  "freestanding":            "Freestanding Access",
  "free standing access":    "Freestanding Access",
  "free standing":           "Freestanding Access",
  "bridged access scaffold": "Bridged Access",
  "access over roof":        "Access over Roof / Conservatory",
  "conservatory access":     "Access over Roof / Conservatory",
  "access over roof / conservatory access": "Access over Roof / Conservatory",
}

/**
 * Legacy values that are genuinely ambiguous or describe a different axis
 * entirely (construction method, not type of works) — listed explicitly so
 * the "why was this flagged" reasoning is visible in code, not just emitted
 * as a generic "no match" at runtime.
 */
const KNOWN_AMBIGUOUS: Record<string, string> = {
  "façade scaffold": "Could mean Access Scaffold, Bridged Access, or Freestanding Access depending on the actual structure — façade scaffolds aren't one of the new categories on their own.",
  "facade scaffold":  "Could mean Access Scaffold, Bridged Access, or Freestanding Access depending on the actual structure — façade scaffolds aren't one of the new categories on their own.",
  "gantry & loading bay": "The old combined category splits into two separate new ones (Gantry, Loading Bay) — can't tell which applied without checking the job.",
  "gantry and loading bay": "The old combined category splits into two separate new ones (Gantry, Loading Bay) — can't tell which applied without checking the job.",
  "tube & fitting": "Describes a construction method, not a type of works — doesn't correspond to any approved category on its own.",
  "tube and fitting": "Describes a construction method, not a type of works — doesn't correspond to any approved category on its own.",
  "system scaffold": "Describes a construction method, not a type of works — doesn't correspond to any approved category on its own.",
  "suspended scaffold": "Structurally distinct (hung from above) from anything on the approved list — closest candidates (Access Scaffold) aren't a confident match.",
}

function normalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ")
}

export type MatchType = "EXACT" | "ALIAS" | "FLAGGED"

export interface ClassifiedWorksType {
  mappedTo: string
  customDescription: string | null
  matchType: MatchType
  needsReview: boolean
  reason?: string
}

/**
 * Classifies one legacy typeOfWorks value against the approved list.
 * - EXACT: already one of the approved values (or equal after trim/case
 *   normalization) — mapped directly, no review needed.
 * - ALIAS: matched a known abbreviation/variant in the dictionary above —
 *   mapped directly, no review needed.
 * - FLAGGED: no confident match. mappedTo is always "Other" so the record
 *   stays usable in filters/reports immediately; customDescription
 *   preserves the original text (never discarded) and needsReview is true
 *   so it surfaces in the migration log for a human to confirm or correct.
 */
export function classifyLegacyWorksType(raw: string | null | undefined): ClassifiedWorksType {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) {
    // Empty/missing value — not really "legacy data" to preserve, just
    // never collected. Flag it since Type of Works is required going
    // forward and an empty historical row should get a human decision.
    return { mappedTo: "Other", customDescription: null, matchType: "FLAGGED", needsReview: true, reason: "No value was ever recorded." }
  }

  // Already valid as-is (covers exact matches and case/whitespace variants
  // of an approved value, e.g. "access scaffold" vs "Access Scaffold")
  const exact = WORKS_TYPES.find(t => normalize(t) === normalize(trimmed))
  if (exact) {
    return { mappedTo: exact, customDescription: exact === "Other" ? trimmed : null, matchType: "EXACT", needsReview: false }
  }

  const alias = ALIASES[normalize(trimmed)]
  if (alias && isValidWorksType(alias)) {
    return { mappedTo: alias, customDescription: null, matchType: "ALIAS", needsReview: false }
  }

  const ambiguousReason = KNOWN_AMBIGUOUS[normalize(trimmed)]
  return {
    mappedTo: "Other",
    customDescription: trimmed,
    matchType: "FLAGGED",
    needsReview: true,
    reason: ambiguousReason ?? "No confident match in the approved list or alias dictionary.",
  }
}
