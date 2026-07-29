/**
 * Oryx OS typography system — single Inter family, shared scale.
 *
 * Prefer these tokens over arbitrary `text-[Npx]` / ad-hoc font weights.
 * CSS lives in `app/globals.css` (`.type-*` utilities + `@theme` text sizes).
 *
 * Drawing numbers use `Typography.DrawingNumber` (bold Inter) — never mono,
 * never italic, never a CAD face.
 */

export const Typography = {
  /** 28px / 700 — rare hero / auth display */
  Display: "type-display",
  /** 28px / 700 — every page title */
  PageTitle: "type-page-title",
  /** 22px / 600 — major section headings */
  SectionHeading: "type-section-heading",
  /** 18px / 600 — card / panel / dialog titles */
  CardTitle: "type-card-title",
  /** Alias for CardTitle */
  CardHeading: "type-card-title",
  /** 28px / 700 — KPI / statistic values */
  Stat: "type-stat",
  LargeStatistic: "type-stat",
  /** 14px / 500 — emphasised body */
  BodyLarge: "type-body-lg",
  /** 14px / 400 — default body copy + inputs */
  Body: "type-body",
  /** 13px / 400 — secondary text */
  Secondary: "type-small",
  Small: "type-small",
  SmallBody: "type-small",
  /** 14px / 400 — table cells */
  Table: "type-table",
  /** 14px / 700 — table column headings */
  TableHead: "type-table-head",
  /** 12px / 500 — form labels */
  Label: "type-label",
  /** 12px / 400 — helper / hint / meta */
  Helper: "type-helper",
  Caption: "type-helper",
  /** 12px / 500 — status badges & chips */
  Badge: "type-badge",
  /** 14px / 500 — sidebar navigation */
  Nav: "type-nav",
  /** 14px / 500 — buttons */
  Button: "type-button",
  /**
   * Drawing numbers & job/quote IDs — bold Inter only.
   * Pair with a size role (PageTitle, Table, Badge, Helper) as needed.
   */
  DrawingNumber: "type-drawing-number",
} as const

export type TypographyToken = (typeof Typography)[keyof typeof Typography]
