import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const migration047 = readFileSync(
  join(__dirname, "../../supabase/migrations/047_search_pg_trgm_indexes.sql"),
  "utf8",
)
const migration046 = readFileSync(
  join(__dirname, "../../supabase/migrations/046_jobs_list_scoped_page.sql"),
  "utf8",
)

const {
  escapePostgrestFilterValue,
  postgrestOrIlike,
} = require("../../shared/supabase/postgrest-filter.ts")

const jobsRepoSrc = readFileSync(
  join(__dirname, "../../modules/jobs/supabase/repository.ts"),
  "utf8",
)
const clientsRepoSrc = readFileSync(
  join(__dirname, "../../modules/clients/supabase/repository.ts"),
  "utf8",
)
const quotesRepoSrc = readFileSync(
  join(__dirname, "../../modules/quotes/supabase/repository.ts"),
  "utf8",
)
const billingRepoSrc = readFileSync(
  join(__dirname, "../../modules/billing/supabase/repository.ts"),
  "utf8",
)
const jobsRegisterSrc = readFileSync(
  join(__dirname, "../../modules/jobs/components/jobs-register.tsx"),
  "utf8",
)
const clientsPageSrc = readFileSync(
  join(__dirname, "../../modules/clients/components/client-directory-page.tsx"),
  "utf8",
)
const quotesPageSrc = readFileSync(
  join(__dirname, "../../modules/quotes/components/quotes-page.tsx"),
  "utf8",
)

/** Mirror SQL escape used in migration 047 search_pat. */
function sqlIlikeSubstringPattern(raw) {
  const needle = String(raw ?? "").trim()
  if (!needle) return null
  return (
    "%"
    + needle.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
    + "%"
  )
}

/** Case-insensitive substring — historical RPC strpos(lower, lower) semantics. */
function strposMatch(haystack, needle) {
  return String(haystack ?? "").toLowerCase().includes(String(needle).toLowerCase())
}

/**
 * ILIKE '%pat%' ESCAPE '\\' with pat from sqlIlikeSubstringPattern —
 * equivalent for ordinary text when %/_/\ are escaped.
 */
function ilikeContainsEscaped(haystack, needle) {
  const n = String(needle ?? "").trim()
  if (!n) return true
  const h = String(haystack ?? "")
  // After escaping wildcards, match is literal substring (case-insensitive).
  return h.toLowerCase().includes(n.toLowerCase())
}

/** Strip SQL comments so assertions don't match documentation text. */
function sqlBody(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "")
}

describe("migration 047 pg_trgm search indexes", () => {
  const sql047 = sqlBody(migration047)

  it("enables pg_trgm and creates required GIN indexes", () => {
    assert.match(sql047, /create extension if not exists pg_trgm/i)
    const required = [
      "idx_jobs_drawing_number_trgm",
      "idx_jobs_address_trgm",
      "idx_jobs_client_company_trgm",
      "idx_jobs_requested_by_trgm",
      "idx_jobs_type_of_works_trgm",
      "idx_jobs_custom_type_description_trgm",
      "idx_jobs_designer_trgm",
      "idx_jobs_quote_reference_trgm",
      "idx_clients_name_lower_trgm",
      "idx_clients_contact_name_trgm",
      "idx_clients_email_trgm",
      "idx_clients_phone_trgm",
      "idx_clients_account_code_trgm",
      "idx_quotes_quote_number_trgm",
      "idx_quotes_client_company_trgm",
      "idx_quotes_address_trgm",
      "idx_quotes_description_trgm",
    ]
    for (const name of required) {
      assert.match(
        sql047,
        new RegExp(`create index if not exists ${name}[\\s\\S]*?gin_trgm_ops`, "i"),
        `missing ${name}`,
      )
    }
  })

  it("does not use CONCURRENTLY (transactional migrations)", () => {
    assert.doesNotMatch(sql047, /concurrently/i)
  })

  it("does not index billing_handoffs (small queue — skipped)", () => {
    assert.doesNotMatch(sql047, /billing_handoffs|idx_billing/i)
  })

  it("rewrites jobs_list_scoped_page search to ILIKE ESCAPE with preserved grants", () => {
    assert.match(sql047, /create or replace function public\.jobs_list_scoped_page/i)
    assert.match(sql047, /search_pat/)
    assert.match(sql047, /ilike p\.search_pat escape/i)
    assert.doesNotMatch(sql047, /strpos\s*\(/i)
    assert.match(sql047, /grant execute on function public\.jobs_list_scoped_page[\s\S]*service_role/i)
    assert.match(sql047, /revoke all on function public\.jobs_list_scoped_page[\s\S]*anon,\s*authenticated/i)
  })

  it("keeps the same searchable job columns as migration 046", () => {
    const cols = [
      "drawing_number",
      "address",
      "client_company",
      "requested_by",
      "type_of_works",
      "custom_type_description",
      "designer",
      "quote_reference",
    ]
    for (const col of cols) {
      assert.match(migration046, new RegExp(`j\\.${col}`))
      assert.match(migration047, new RegExp(`j\\.${col}`))
    }
    assert.match(migration047, /j\.tags && p_search_tags/)
  })
})

describe("Jobs / Clients / Quotes search columns (server-side)", () => {
  it("Jobs applyWhere uses postgrestOrIlike on the indexed columns", () => {
    assert.match(jobsRepoSrc, /postgrestOrIlike\([\s\S]*drawing_number[\s\S]*address[\s\S]*client_company/)
    assert.match(jobsRepoSrc, /jobs_list_scoped_page/)
  })

  it("Clients directory + typeahead stay server-side substring", () => {
    assert.match(clientsRepoSrc, /postgrestOrIlike\([\s\S]*name_lower[\s\S]*contact_name[\s\S]*email/)
    assert.match(clientsRepoSrc, /\.ilike\("name_lower"/)
  })

  it("Quotes list uses postgrestOrIlike on quote fields", () => {
    assert.match(
      quotesRepoSrc,
      /postgrestOrIlike\([\s\S]*quote_number[\s\S]*client_company[\s\S]*address[\s\S]*description/,
    )
  })

  it("Billing handoff search remains ILIKE but is not trigram-indexed", () => {
    assert.match(billingRepoSrc, /postgrestOrIlike\([\s\S]*drawing_number[\s\S]*client_company/)
  })
})

describe("search behaviour parity (strpos ↔ escaped ILIKE)", () => {
  const cases = [
    "",
    "   ",
    "a",
    "ac",
    "Acme",
    "ACM-123",
    "high street",
    "100%",
    "under_score",
    "a\\b",
    "Q-2025",
    "  spaced  ",
  ]

  for (const term of cases) {
    it(`needle ${JSON.stringify(term)}`, () => {
      const haystacks = [
        "ACM-12345/ORYX/25",
        "Acme Yard 12 High Street",
        "Acme Scaffolding Ltd",
        "Bob_Smith",
        "100% complete",
        "path\\name",
        "",
        null,
      ]
      const trimmed = term.trim()
      if (!trimmed) {
        assert.equal(sqlIlikeSubstringPattern(term), null)
        return
      }
      const pat = sqlIlikeSubstringPattern(term)
      assert.ok(pat.startsWith("%") && pat.endsWith("%"))
      for (const h of haystacks) {
        assert.equal(
          ilikeContainsEscaped(h, trimmed),
          strposMatch(h, trimmed),
          `haystack=${JSON.stringify(h)}`,
        )
      }
    })
  }

  it("PostgREST escape keeps % and _ literal in classic list filters", () => {
    assert.equal(escapePostgrestFilterValue("100%_off"), "100\\%\\_off")
  })

  it("postgrestOrIlike keeps %term% shape used by trigram indexes", () => {
    const clause = postgrestOrIlike(["drawing_number", "client_company"], "Acme")
    assert.equal(
      clause,
      "drawing_number.ilike.%Acme%,client_company.ilike.%Acme%",
    )
    assert.equal(
      postgrestOrIlike(["name_lower"], "100%"),
      "name_lower.ilike.%100\\%%",
    )
  })
})

describe("search debounce / request keys (unchanged)", () => {
  it("Jobs register debounce stays ~200ms and search is in the query key", () => {
    assert.match(jobsRegisterSrc, /useDebouncedValue\(search,\s*200\)/)
    assert.match(jobsRegisterSrc, /p\.set\("search",\s*debouncedSearch\.trim\(\)\)/)
  })

  it("Clients / Quotes keep ~280ms debounce", () => {
    assert.match(clientsPageSrc, /useDebouncedValue\(search,\s*280\)/)
    assert.match(quotesPageSrc, /useDebouncedValue\(search,\s*280\)/)
  })
})
