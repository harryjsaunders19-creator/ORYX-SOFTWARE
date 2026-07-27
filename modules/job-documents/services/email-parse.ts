/**
 * Best-effort MSG / EML metadata extraction. Never throws to callers —
 * upload succeeds even when parse fails.
 */
import type { ParsedEmailMeta } from "../types"
import { fileExt, isEmailFile } from "../constants"

function firstLines(text: string | null | undefined, max = 400): string | null {
  if (!text?.trim()) return null
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim()
  return cleaned.slice(0, max)
}

function formatAddress(value: unknown): string | null {
  if (!value) return null
  if (typeof value === "string") return value.trim() || null
  if (Array.isArray(value)) {
    return value
      .map(v => {
        if (typeof v === "string") return v
        if (v && typeof v === "object") {
          const o = v as { name?: string; address?: string; text?: string }
          if (o.text) return o.text
          if (o.name && o.address) return `${o.name} <${o.address}>`
          return o.address ?? o.name ?? ""
        }
        return ""
      })
      .filter(Boolean)
      .join(", ") || null
  }
  if (typeof value === "object") {
    const o = value as { text?: string; value?: unknown }
    if (o.text) return o.text
    if (o.value) return formatAddress(o.value)
  }
  return null
}

async function parseEml(buffer: Buffer): Promise<ParsedEmailMeta> {
  const { simpleParser } = await import("mailparser")
  const parsed = await simpleParser(buffer)
  return {
    subject: parsed.subject?.trim() || null,
    from: formatAddress(parsed.from),
    to: formatAddress(parsed.to),
    cc: formatAddress(parsed.cc),
    date: parsed.date ? parsed.date.toISOString() : null,
    preview: firstLines(parsed.text || (typeof parsed.html === "string"
      ? parsed.html.replace(/<[^>]+>/g, " ")
      : null)),
    ok: true,
  }
}

async function parseMsg(buffer: Buffer): Promise<ParsedEmailMeta> {
  const MsgReader = (await import("@kenjiuno/msgreader")).default
  const reader = new MsgReader(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer)
  const data = reader.getFileData() as {
    subject?: string
    senderName?: string
    senderEmail?: string
    recipients?: Array<{ name?: string; email?: string; recipType?: string }>
    body?: string
    bodyHtml?: string
    messageDeliveryTime?: string | Date
    clientSubmitTime?: string | Date
  }

  const from = [data.senderName, data.senderEmail ? `<${data.senderEmail}>` : null]
    .filter(Boolean)
    .join(" ") || data.senderEmail || null

  const toRecipients = (data.recipients ?? [])
    .filter(r => !r.recipType || r.recipType === "to" || r.recipType === "1")
    .map(r => [r.name, r.email ? `<${r.email}>` : null].filter(Boolean).join(" "))
    .filter(Boolean)
  const ccRecipients = (data.recipients ?? [])
    .filter(r => r.recipType === "cc" || r.recipType === "2")
    .map(r => [r.name, r.email ? `<${r.email}>` : null].filter(Boolean).join(" "))
    .filter(Boolean)

  const rawDate = data.messageDeliveryTime || data.clientSubmitTime
  let date: string | null = null
  if (rawDate instanceof Date) date = rawDate.toISOString()
  else if (typeof rawDate === "string" && rawDate) {
    const d = new Date(rawDate)
    date = Number.isNaN(d.getTime()) ? rawDate : d.toISOString()
  }

  const bodyText = data.body
    || (data.bodyHtml ? data.bodyHtml.replace(/<[^>]+>/g, " ") : null)

  return {
    subject: data.subject?.trim() || null,
    from,
    to: toRecipients.join(", ") || null,
    cc: ccRecipients.join(", ") || null,
    date,
    preview: firstLines(bodyText),
    ok: true,
  }
}

export async function parseEmailFile(
  filename: string,
  mime: string,
  buffer: Buffer,
): Promise<ParsedEmailMeta> {
  if (!isEmailFile(filename, mime)) {
    return { subject: null, from: null, to: null, cc: null, date: null, preview: null, ok: false }
  }
  try {
    const ext = fileExt(filename)
    if (ext === ".eml" || mime === "message/rfc822") {
      return await parseEml(buffer)
    }
    if (ext === ".msg" || mime === "application/vnd.ms-outlook") {
      return await parseMsg(buffer)
    }
    // Heuristic: try EML first, then MSG
    try {
      return await parseEml(buffer)
    } catch {
      return await parseMsg(buffer)
    }
  } catch {
    return { subject: null, from: null, to: null, cc: null, date: null, preview: null, ok: false }
  }
}
