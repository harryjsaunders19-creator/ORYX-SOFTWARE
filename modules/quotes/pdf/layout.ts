import { rgb } from "pdf-lib"

/** A4 page geometry (points). */
export const PAGE = {
  width: 595.28,
  height: 841.89,
} as const

export const MARGIN = {
  left: 48,
  right: 48,
  top: 52,
  bottom: 56,
} as const

export const CONTENT_LEFT = MARGIN.left
export const CONTENT_RIGHT = PAGE.width - MARGIN.right
export const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT

/** 4-pt spacing scale. */
export const SP = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

/** Typography scale — one family, intentional hierarchy. */
export const TYPE = {
  companyName: 11,
  companyDetail: 8,
  /** "QUOTATION" label in the title area. */
  docTitle: 12,
  /** Prominent quote reference. */
  quoteNumber: 22,
  metaLabel: 7.5,
  metaValue: 9.5,
  section: 10,
  body: 10.25,
  table: 10,
  tableHead: 9,
  terms: 9.25,
  totalLabel: 10,
  totalValue: 10.25,
  grandTotal: 24,
  footer: 8,
} as const

export const LEADING = {
  tight: 1.35,
  body: 1.55,
  relaxed: 1.65,
  terms: 1.6,
} as const

export const COLOR = {
  ink: rgb(0.07, 0.07, 0.07),
  muted: rgb(0.42, 0.42, 0.42),
  faint: rgb(0.58, 0.58, 0.58),
  rule: rgb(0.84, 0.84, 0.84),
  panel: rgb(0.975, 0.975, 0.975),
  panelBorder: rgb(0.9, 0.9, 0.9),
  rowAlt: rgb(0.985, 0.985, 0.985),
  totalsBg: rgb(0.955, 0.955, 0.955),
  white: rgb(1, 1, 1),
} as const

export const LOGO = {
  width: 88,
  height: 54,
} as const

export const FOOTER_Y = 36
// Reserve bottom space for the multi-line corporate footer.
// The footer is relatively small (multi-line text near the bottom).
// Reserve only the minimum printable area so short quotes can fit.
export const FOOTER_RESERVE = 16
export const MIN_CONTENT_Y = MARGIN.bottom + FOOTER_RESERVE

export const TABLE = {
  headerHeight: 26,
  minRowHeight: 36,
  rowPadY: 14,
  rowPadX: 10,
  /** Description dominates. */
  colDesc: 0.50,
  colQty: 0.08,
  colRate: 0.15,
  colVat: 0.10,
  colTotal: 0.17,
} as const

export function lineStep(size: number, leading: number = LEADING.body): number {
  return Math.round(size * leading)
}

export function capHeight(size: number): number {
  return Math.round(size * 0.72)
}

export function descender(size: number): number {
  return Math.round(size * 0.21)
}
