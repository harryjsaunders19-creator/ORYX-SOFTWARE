/**
 * Oryx OS Inspector design tokens — shared by Jobs and every future module panel.
 * Prefer these over ad-hoc spacing so inspectors stay visually identical.
 */
export const inspectorTokens = {
  /** Between major body sections (cards, metadata, accordions). */
  section: "gap-7",
  sectionY: "space-y-7",
  /** Padding inside InfoCard / RevisionCard. */
  cardPadding: "p-5",
  /** Metadata property grid row gap. */
  metaRow: "gap-y-4",
  metaCol: "gap-x-5",
  /** Header logical groups (title → client → strip → badges → actions). */
  headerGroup: "mt-3",
  headerGroupLg: "mt-5",
  /** Accordion / section rule top spacing. */
  accordion: "pt-6",
  /** Sticky header chrome. */
  headerPad: "px-7 pt-5 pb-5",
  /** Scrollable body chrome (+8px horizontal vs list edge). */
  bodyPad: "px-7 py-5",
} as const

export const inspectorType = {
  sectionHeading: "text-[13px] font-semibold tracking-wide text-t1",
  fieldLabel: "mb-0 text-[10px] font-semibold uppercase tracking-[0.12em] leading-none text-t3",
  fieldValue: "text-sm font-medium leading-snug text-t1",
  fieldMuted: "text-sm leading-snug text-t2",
  cardEyebrow: "text-[11px] font-semibold uppercase tracking-[0.14em] text-t3",
  cardTitle: "text-[15px] font-semibold leading-snug text-t1",
  cardBody: "text-[15px] font-semibold leading-relaxed whitespace-pre-wrap text-t1",
  cardBodyEmpty: "text-[15px] font-medium leading-relaxed text-t2",
} as const
