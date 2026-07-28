export function invoiceLabel(status: string): string {
  switch (status) {
    case "INVOICED": return "Invoiced"
    case "READY": return "Awaiting invoice"
    case "WRITTEN_OFF": return "Written off"
    default: return "—"
  }
}

export function priorityTone(priority: string | null | undefined): "dn" | "neutral" | null {
  if (!priority) return null
  if (priority === "HIGH" || priority === "URGENT") return "dn"
  return "neutral"
}

export function priorityLabel(priority: string | null | undefined): string | null {
  if (!priority) return null
  return priority.charAt(0) + priority.slice(1).toLowerCase() + " Priority"
}
