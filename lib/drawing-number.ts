/** Drawing number format: YY/ORYX/MM/NNN  e.g. 26/ORYX/06/001 */

export function formatDrawingNumber(year: number, month: number, seq: number) {
  const yy  = String(year).slice(-2)
  const mm  = String(month).padStart(2, "0")
  const nnn = String(seq).padStart(3, "0")
  return `${yy}/ORYX/${mm}/${nnn}`
}

export function getYearMonthKey(date = new Date()) {
  const year  = date.getFullYear()
  const month = date.getMonth() + 1
  const key   = `${String(year).slice(-2)}${String(month).padStart(2, "0")}`
  return { year, month, key }
}
