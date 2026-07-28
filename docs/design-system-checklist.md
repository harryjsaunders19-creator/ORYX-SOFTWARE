# Oryx Design System Refinement Checklist

Feature-complete refinement plan. **Do not expand product scope** (no new global search, activity feed, or BI dashboards in this pass). Prioritise consistency, polish, and shared primitives.

Status: `P0` = foundation this PR · `P1` = next pass · `P2` = later · `Defer` = expansion (out of scope)

---

## Phase 0 — Audit findings (done)

| # | Issue | Impact |
|---|--------|--------|
| 1 | Fractured radius (6/8/10/12/14/20px + inline overrides) | High |
| 2 | Shadow policy unclear (`shadow-card: none` vs soft card/toast shadows) | High |
| 3 | Search controls: pill vs square vs h-8/h-9/h-10 | High |
| 4 | Ad-hoc blue/purple accents (calendar, map, KPI indigo) | High |
| 5 | KpiTile vs dashboard StatCard border/accent mismatch | High |
| 6 | Parallel empty states (EmptyPanel / jobs EmptyState / italic stubs) | Med |
| 7 | Native `<select>` vs Radix Select heights | Med |
| 8 | Client combobox stone hex borders | Med |
| 9 | Dropdown item colours ignore dark mode | Med |
| 10 | `global-error.tsx` wrong CSS var names | Med |
| 11 | Orphan purple accent in bare `html.dark` | Med |
| 12 | Chart-2 indigo leaks into KPI accents | Med |
| 13 | PageShell wide vs constrained lottery | Low–Med |
| 14 | Double chrome (top bar title + PageHeader) | Low (defer redesign) |
| 15 | Custom modals vs Dialog z-index/blur | Low–Med |
| 16 | Pagination copy/size differences | Low |
| 17 | Label typography voice drift | Low |
| 18 | Loading: skeleton vs plain text | Low |
| 19 | Token docs still say “v3 Apple” | Docs |
| 20 | Job detail abandons PageHeader | Low–Med |

---

## Phase 1 — Global tokens & primitives (`P0`)

- [x] Align radius scale: control 8px · card 12px · modal 12px; remove inline 10/14/20 overrides
- [x] Soften token docs to Stitch Engineering OS (not Apple v3 narrative)
- [x] Replace chart-2 indigo with restrained slate; monochrome dark accent (no purple)
- [x] Button / Input / Dialog / Dropdown / Toast use `var(--radius-*)`
- [x] SearchField = standard control height (h-9) + surface-low
- [x] KpiTile uses `border-bd` + design tokens (no `#E5E7EB` / indigo props)
- [x] Dropdown item colours via CSS variables (dark-mode safe)
- [x] Fix `global-error.tsx` token fallbacks
- [x] Calendar category colours → design-system hues (no Tailwind blue/purple)
- [x] Client combobox → token borders + h-9
- [x] Jobs toolbar search → same SearchField language (not pill)
- [x] Jobs empty state → shared `EmptyPanel`
- [x] Map / import / client KPI accents → token colours
- [x] Native filter selects → h-9 / rounded-lg to match controls
- [x] PageStack helper (8px spacing rhythm)

## Phase 2 — Layout & tables (`P1`)

- [x] Standardise list pages on `PageShell` + `PageHeader` + `ToolbarCard` + `DataPanel`
- [x] Shared `TablePagination` chrome (copy + icon size)
- [x] Archive tabs → shared `TabBar`
- [x] Align PageShell `wide` policy (lists wide, directories constrained)
- [x] Detail pages: BackLink + title hierarchy closer to PageHeader (`PageBreadcrumb` + `oryx-page-title`)

## Phase 3 — Forms & feedback (`P1`)

- [x] Shared `Field` / `FieldError` / `FormAlert` wrapper
- [x] Replace remaining custom overlays with Dialog where safe (ExportModal, HoldWarningDialog)
- [x] Unify loading: list skeletons only (retire bare “Loading…” where practical)
- [x] Login page → AuthLayout parity

## Phase 4 — Colour & polish sweep (`P1`)

- [ ] Grep remaining hardcoded hex in UI components; migrate to tokens
- [ ] Icon size scale: 14 / 16 / 20 only
- [ ] 8px spacing audit on job detail / parent dashboard sections

## Phase 5 — Expansion (explicitly deferred)

- [ ] Dashboard BI expansion
- [ ] Unified global search
- [ ] Global activity timeline
- [ ] Table column resize / universal export
- [ ] Broad automation of manual processes

---

## Typography hierarchy (target)

| Role | Class / token | Size |
|------|----------------|------|
| Page title | `.oryx-page-title` | 1.5rem / 600 |
| Section | `text-sm font-semibold` | 14px |
| Card / panel label | `text-xs font-semibold uppercase tracking-wider text-t3` | 12px |
| Body | `text-sm text-t1` | 14px |
| Metadata | `text-xs text-t3` | 12px |
| Caption | `text-[11px] text-t4` | 11px |
| Mono codes | `font-mono` | drawing nos, KPI labels |

## Colour usage rule

Use colour only for: primary actions, warnings, errors, success, information, status/category identity. Prefer charcoal / grey / teal (`ac` / `ac2`) over decorative indigo/purple/blue.
