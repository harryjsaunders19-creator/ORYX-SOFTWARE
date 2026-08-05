/** Shared formatting helpers for quote PDF output. */
import { format } from "date-fns"

export function fmtMoney(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function fmtNumber(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function fmtQuantity(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

export function fmtPdfDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  try {
    return format(new Date(value), "d MMMM yyyy")
  } catch {
    return value.trim()
  }
}
