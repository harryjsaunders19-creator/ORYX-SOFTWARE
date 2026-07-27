/**
 * Neutralize spreadsheet formula injection for CSV/Excel exports.
 * Prefixes values that Excel/Sheets would treat as formulas.
 */
export function sanitizeSpreadsheetCell(value: unknown): string | number | boolean | Date | null {
  if (value == null) return null
  if (typeof value === "number" || typeof value === "boolean") return value
  if (value instanceof Date) return value

  const text = String(value)
  if (!text) return ""

  // Excel formula / command injection prefixes (and tab/CR which some parsers treat similarly).
  if (/^[=+\-@\t\r]/.test(text)) {
    return `'${text}`
  }
  return text
}
