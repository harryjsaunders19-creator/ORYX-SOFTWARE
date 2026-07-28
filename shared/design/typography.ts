/**
 * Oryx OS typography system — single Inter family, shared scale.
 *
 * Prefer these tokens over arbitrary `text-[Npx]` / ad-hoc font weights.
 * CSS lives in `app/globals.css` (`.type-*` utilities + `@theme` text sizes).
 * JetBrains Mono remains only for `.font-mono` (IDs, drawing numbers, money).
 */

export const Typography = {
  /** 36px / 700 — rare hero / auth display */
  Display: "type-display",
  /** 30px / 700 — every page title */
  PageTitle: "type-page-title",
  /** 24px / 600 — major section headings */
  SectionHeading: "type-section-heading",
  /** 20px / 600 — card / panel titles */
  CardTitle: "type-card-title",
  /** Alias for CardTitle */
  CardHeading: "type-card-title",
  /** 32px / 700 — KPI / statistic values */
  Stat: "type-stat",
  LargeStatistic: "type-stat",
  /** 16px / 500 — emphasised body */
  BodyLarge: "type-body-lg",
  /** 15px / 400 — default body copy */
  Body: "type-body",
  /** 14px / 400 — secondary / dense body */
  Small: "type-small",
  SmallBody: "type-small",
  /** 14px / 400 — table cells */
  Table: "type-table",
  /** 13px / 500 — table column headings */
  TableHead: "type-table-head",
  /** 13px / 500 — form labels */
  Label: "type-label",
  /** 12px / 400 — helper / hint / meta */
  Helper: "type-helper",
  Caption: "type-helper",
  /** 12px / 600 — status badges & chips */
  Badge: "type-badge",
  /** 14px / 500 — sidebar navigation */
  Nav: "type-nav",
  /** 14px / 600 — buttons */
  Button: "type-button",
} as const

export type TypographyToken = (typeof Typography)[keyof typeof Typography]
