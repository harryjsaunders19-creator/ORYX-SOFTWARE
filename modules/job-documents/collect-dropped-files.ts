import { fileExt, inferMimeType } from "./constants"

/** OLE compound document header used by Outlook .msg files. */
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const

function looksLikeMsg(bytes: Uint8Array): boolean {
  if (bytes.length < OLE_MAGIC.length) return false
  return OLE_MAGIC.every((b, i) => bytes[i] === b)
}

function looksLikeEml(textStart: string): boolean {
  const head = textStart.slice(0, 2048).toLowerCase()
  return (
    head.startsWith("from:") ||
    head.startsWith("received:") ||
    head.startsWith("return-path:") ||
    head.startsWith("mime-version:") ||
    head.includes("\nfrom:") ||
    head.includes("\nsubject:") ||
    head.includes("\r\nfrom:") ||
    head.includes("\r\nsubject:")
  )
}

function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
  return cleaned || "email"
}

/**
 * Outlook often drops emails with a blank type, a truncated name, or no extension.
 * Normalize so our upload allow-list and email parser recognize them.
 */
export async function normalizeDroppedFile(file: File): Promise<File | null> {
  // Materialize bytes immediately. Outlook virtual files can report size 0 until read,
  // and the underlying stream may disappear if we delay.
  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch {
    return null
  }
  if (buffer.byteLength === 0) return null

  let name = sanitizeFilename(file.name || "email")
  let mime = file.type || ""
  let ext = fileExt(name)
  const head = new Uint8Array(buffer.slice(0, 1024))

  if (!ext) {
    if (looksLikeMsg(head)) {
      name = `${name}.msg`
      mime = "application/vnd.ms-outlook"
      ext = ".msg"
    } else {
      const asText = new TextDecoder("utf-8", { fatal: false }).decode(head)
      if (looksLikeEml(asText)) {
        name = `${name}.eml`
        mime = "message/rfc822"
        ext = ".eml"
      } else if (mime === "application/vnd.ms-outlook" || mime === "message/rfc822") {
        name = `${name}${mime.includes("outlook") ? ".msg" : ".eml"}`
        ext = fileExt(name)
      } else if (!mime || mime === "application/octet-stream") {
        // Classic Outlook often drops the subject as the filename with no extension.
        name = `${name}.msg`
        mime = "application/vnd.ms-outlook"
        ext = ".msg"
      }
    }
  }

  if (ext === ".msg" && (!mime || mime === "application/octet-stream")) {
    mime = "application/vnd.ms-outlook"
  }
  if (ext === ".eml" && (!mime || mime === "application/octet-stream" || mime === "text/plain")) {
    mime = "message/rfc822"
  }

  const inferred = inferMimeType(name, mime)
  return new File([buffer], name, {
    type: inferred,
    lastModified: file.lastModified || Date.now(),
  })
}

/**
 * Parse Chromium DownloadURL drag payload: `mimeType:fileName:url`
 * Used by New Outlook / some shell drops. Filename may contain colons —
 * URL starts at the last "://" or "blob:" segment after the second colon rule.
 */
function parseDownloadURL(raw: string): { mime: string; name: string; url: string } | null {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  for (const line of lines) {
    const first = line.indexOf(":")
    if (first <= 0) continue
    const rest = line.slice(first + 1)
    // Prefer splitting on ":https:", ":http:", ":blob:"
    const urlMatch = rest.match(/:(https?:\/\/.+|blob:.+)$/i)
    if (urlMatch && urlMatch.index != null) {
      const name = sanitizeFilename(rest.slice(0, urlMatch.index))
      const url = urlMatch[1]
      const mime = line.slice(0, first).trim() || "application/octet-stream"
      if (name && url) return { mime, name, url }
    }
    const second = rest.indexOf(":")
    if (second < 0) continue
    const name = sanitizeFilename(rest.slice(0, second))
    const url = rest.slice(second + 1).trim()
    const mime = line.slice(0, first).trim() || "application/octet-stream"
    if (name && url) return { mime, name, url }
  }
  return null
}

async function fileFromUrl(url: string, name: string, mime: string): Promise<File | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    if (blob.size === 0) return null
    const type = blob.type || mime || "application/octet-stream"
    return new File([blob], sanitizeFilename(name), { type })
  } catch {
    return null
  }
}

type SyncDropCapture = {
  files: File[]
  downloadURL: string | null
  textPlain: string
  textHtml: string
  uriList: string
  otherStrings: Array<{ type: string; data: string }>
}

/**
 * MUST run synchronously inside the drop handler — browsers clear DataTransfer
 * after the event handler yields, which breaks Outlook virtual-file drops.
 */
export function captureDropDataSync(dt: DataTransfer): SyncDropCapture {
  const files: File[] = []

  // Prefer items.getAsFile() — Outlook virtual MSG files often appear here first.
  if (dt.items?.length) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i]
      if (!item || item.kind !== "file") continue
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }

  if (!files.length && dt.files?.length) {
    files.push(...Array.from(dt.files))
  }

  const types = Array.from(dt.types ?? [])
  let downloadURL: string | null = null
  let textPlain = ""
  let textHtml = ""
  let uriList = ""
  const otherStrings: Array<{ type: string; data: string }> = []

  for (const type of types) {
    let data = ""
    try {
      data = dt.getData(type)
    } catch {
      continue
    }
    if (!data) continue
    const lower = type.toLowerCase()
    if (lower === "downloadurl") downloadURL = data
    else if (lower === "text/plain") textPlain = data
    else if (lower === "text/html") textHtml = data
    else if (lower === "text/uri-list") uriList = data
    else if (itemLooksUsefulString(lower, data)) otherStrings.push({ type: lower, data })
  }

  return { files, downloadURL, textPlain, textHtml, uriList, otherStrings }
}

function itemLooksUsefulString(type: string, data: string): boolean {
  if (data.length < 8) return false
  if (type.includes("uri") || type.includes("url") || type.includes("download")) return true
  if (looksLikeEml(data)) return true
  // Chromium custom MIME from New Outlook sometimes carries JSON + urls
  if (data.includes("http://") || data.includes("https://") || data.includes("blob:")) return true
  return false
}

function emlFileFromText(text: string, suggestedName?: string): File | null {
  if (!looksLikeEml(text)) return null
  const base = sanitizeFilename(suggestedName || subjectFromEml(text) || "email")
  const name = fileExt(base) === ".eml" ? base : `${base}.eml`
  return new File([text], name, { type: "message/rfc822", lastModified: Date.now() })
}

function subjectFromEml(text: string): string | null {
  const m = text.match(/^subject:\s*(.+)$/im)
  return m?.[1]?.trim() || null
}

function urlsFromUriList(uriList: string): string[] {
  return uriList
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#") && /^(https?:|blob:)/i.test(l))
}

/**
 * Collect files from a drop event, including Outlook virtual .msg/.eml drops.
 * Pass the result of `captureDropDataSync(e.dataTransfer)` — do not read
 * DataTransfer after an await.
 */
export async function collectDroppedFilesFromCapture(capture: SyncDropCapture): Promise<File[]> {
  const collected: File[] = []
  const seen = new Set<string>()

  const pushUnique = async (file: File | null | undefined) => {
    if (!file) return
    const normalized = await normalizeDroppedFile(file)
    if (!normalized) return
    const key = `${normalized.name}:${normalized.size}`
    if (seen.has(key)) return
    seen.add(key)
    collected.push(normalized)
  }

  for (const file of capture.files) {
    await pushUnique(file)
  }

  if (!collected.length && capture.downloadURL) {
    const parsed = parseDownloadURL(capture.downloadURL)
    if (parsed) {
      await pushUnique(await fileFromUrl(parsed.url, parsed.name, parsed.mime))
    }
  }

  if (!collected.length) {
    for (const url of urlsFromUriList(capture.uriList)) {
      const name = sanitizeFilename(decodeURIComponent(url.split("/").pop() || "email"))
      await pushUnique(await fileFromUrl(url, name, "application/octet-stream"))
      if (collected.length) break
    }
  }

  if (!collected.length) {
    const fromPlain = emlFileFromText(capture.textPlain)
    if (fromPlain) await pushUnique(fromPlain)
  }

  if (!collected.length) {
    for (const { data } of capture.otherStrings) {
      const fromText = emlFileFromText(data)
      if (fromText) {
        await pushUnique(fromText)
        break
      }
      const asDownload = parseDownloadURL(data)
      if (asDownload) {
        await pushUnique(await fileFromUrl(asDownload.url, asDownload.name, asDownload.mime))
        if (collected.length) break
      }
      // New Outlook Chromium JSON metadata sometimes embeds a file URL
      try {
        const json = JSON.parse(data) as Record<string, unknown>
        const maybeUrl =
          (typeof json.url === "string" && json.url) ||
          (typeof json.downloadUrl === "string" && json.downloadUrl) ||
          (typeof json.fileUrl === "string" && json.fileUrl) ||
          null
        const maybeName =
          (typeof json.name === "string" && json.name) ||
          (typeof json.fileName === "string" && json.fileName) ||
          (typeof json.subject === "string" && json.subject) ||
          "email"
        if (maybeUrl && /^(https?:|blob:)/i.test(maybeUrl)) {
          await pushUnique(await fileFromUrl(maybeUrl, maybeName, "application/octet-stream"))
          if (collected.length) break
        }
      } catch {
        // not JSON
      }
    }
  }

  return collected
}

/** @deprecated Prefer captureDropDataSync + collectDroppedFilesFromCapture */
export async function collectDroppedFiles(dt: DataTransfer): Promise<File[]> {
  return collectDroppedFilesFromCapture(captureDropDataSync(dt))
}

export function droppedFilesIncludeEmail(files: File[]): boolean {
  return files.some(f => {
    const ext = fileExt(f.name)
    return (
      ext === ".msg" ||
      ext === ".eml" ||
      f.type === "application/vnd.ms-outlook" ||
      f.type === "message/rfc822"
    )
  })
}

export function outlookDropHint(capture: SyncDropCapture): string {
  const types = [
    capture.downloadURL ? "DownloadURL" : null,
    capture.uriList ? "text/uri-list" : null,
    capture.textPlain ? "text/plain" : null,
    capture.files.length ? "file" : null,
    ...capture.otherStrings.map(s => s.type),
  ].filter(Boolean)

  const looksLikeOutlookMeta = types.some(t =>
    /mail|outlook|napi|chromium|message/i.test(String(t)),
  )

  if (!capture.files.length && (looksLikeOutlookMeta || capture.uriList || !types.length)) {
    return "Outlook did not hand over the email file to the browser. Use classic Outlook, or save the email as .msg/.eml (File → Save As) and drop that file."
  }
  return "Could not read that drop. Try again, or save as .msg/.eml and upload."
}
