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

/** Outlook drag/clipboard summary (not full RFC822). */
function looksLikeOutlookSummary(text: string): boolean {
  const t = text.trim()
  if (t.length < 12) return false
  const hits = [
    /^from:\s*.+/im.test(t),
    /^sent:\s*.+/im.test(t),
    /^to:\s*.+/im.test(t),
    /^subject:\s*.+/im.test(t),
    /^date:\s*.+/im.test(t),
    /^cc:\s*.+/im.test(t),
  ].filter(Boolean).length
  return hits >= 2
}

function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
  return cleaned.slice(0, 120) || "email"
}

function headerValue(text: string, name: string): string | null {
  const re = new RegExp(`^${name}:\\s*(.+)$`, "im")
  const m = text.match(re)
  return m?.[1]?.trim() || null
}

function subjectFromText(text: string): string | null {
  return headerValue(text, "subject")
}

/**
 * Build a usable .eml when Outlook only hands the browser a text summary
 * (common with New Outlook and some classic Outlook → Chromium drops).
 */
export function outlookTextToEmlFile(text: string, html?: string): File | null {
  const raw = text?.trim() || ""
  const htmlRaw = html?.trim() || ""
  if (!raw && !htmlRaw) return null

  if (raw && looksLikeEml(raw) && !htmlRaw) {
    const base = sanitizeFilename(subjectFromText(raw) || "email")
    const name = fileExt(base) === ".eml" ? base : `${base}.eml`
    return new File([raw.replace(/\n/g, "\r\n")], name, {
      type: "message/rfc822",
      lastModified: Date.now(),
    })
  }

  if (!looksLikeOutlookSummary(raw) && !looksLikeEml(raw) && !htmlRaw) {
    // Still accept a long plain body as a last resort (some Outlook builds)
    if (raw.length < 40) return null
  }

  const subject = subjectFromText(raw) || subjectFromHtml(htmlRaw) || "Outlook email"
  const from = headerValue(raw, "from") || "unknown@outlook.local"
  const to = headerValue(raw, "to") || ""
  const cc = headerValue(raw, "cc") || ""
  const sent = headerValue(raw, "sent") || headerValue(raw, "date") || new Date().toUTCString()

  let body = raw
  const blank = raw.search(/\r?\n\r?\n/)
  if (blank >= 0) body = raw.slice(blank).replace(/^\r?\n\r?\n/, "")
  if (!body && htmlRaw) body = stripHtml(htmlRaw)

  const boundary = `----=_oryx_${Date.now().toString(36)}`
  let eml: string

  if (htmlRaw) {
    eml = [
      `From: ${from}`,
      to ? `To: ${to}` : null,
      cc ? `Cc: ${cc}` : null,
      `Subject: ${subject}`,
      `Date: ${sent}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      body || stripHtml(htmlRaw),
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      htmlRaw,
      "",
      `--${boundary}--`,
      "",
    ].filter(line => line !== null).join("\r\n")
  } else {
    eml = [
      `From: ${from}`,
      to ? `To: ${to}` : null,
      cc ? `Cc: ${cc}` : null,
      `Subject: ${subject}`,
      `Date: ${sent}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      body,
      "",
    ].filter(line => line !== null).join("\r\n")
  }

  const name = `${sanitizeFilename(subject)}.eml`
  return new File([eml], name, { type: "message/rfc822", lastModified: Date.now() })
}

function subjectFromHtml(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m?.[1]?.trim() || null
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim()
}

/**
 * Outlook often drops emails with a blank type, a truncated name, or no extension.
 * Normalize so our upload allow-list and email parser recognize them.
 */
export async function normalizeDroppedFile(file: File): Promise<File | null> {
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
      if (looksLikeEml(asText) || looksLikeOutlookSummary(asText)) {
        name = `${name}.eml`
        mime = "message/rfc822"
        ext = ".eml"
      } else if (mime === "application/vnd.ms-outlook" || mime === "message/rfc822") {
        name = `${name}${mime.includes("outlook") ? ".msg" : ".eml"}`
        ext = fileExt(name)
      } else if (!mime || mime === "application/octet-stream") {
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

function parseDownloadURL(raw: string): { mime: string; name: string; url: string } | null {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  for (const line of lines) {
    const first = line.indexOf(":")
    if (first <= 0) continue
    const rest = line.slice(first + 1)
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

type FileSystemHandleLike = { kind: string; getFile?: () => Promise<File> }

export type SyncDropCapture = {
  files: File[]
  /** Promises created synchronously via DataTransferItem.getAsFileSystemHandle(). */
  handlePromises: Array<Promise<FileSystemHandleLike | null>>
  downloadURL: string | null
  textPlain: string
  textHtml: string
  uriList: string
  types: string[]
  otherStrings: Array<{ type: string; data: string }>
  /** True when we synthesized .eml from Outlook text rather than a real .msg file. */
  synthesizedFromText?: boolean
}

/**
 * MUST run synchronously inside the drop/paste handler — browsers clear
 * DataTransfer after the event handler yields.
 */
export function captureDropDataSync(dt: DataTransfer): SyncDropCapture {
  const files: File[] = []
  const handlePromises: Array<Promise<FileSystemHandleLike | null>> = []

  if (dt.items?.length) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i]
      if (!item) continue

      if (item.kind === "file") {
        const file = item.getAsFile()
        if (file) files.push(file)

        const getHandle = (item as DataTransferItem & {
          getAsFileSystemHandle?: () => Promise<FileSystemHandleLike>
        }).getAsFileSystemHandle
        if (typeof getHandle === "function") {
          try {
            handlePromises.push(
              getHandle.call(item).catch(() => null),
            )
          } catch {
            // unsupported
          }
        }
      }
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
    else otherStrings.push({ type: lower, data })
  }

  return { files, handlePromises, downloadURL, textPlain, textHtml, uriList, types, otherStrings }
}

function urlsFromUriList(uriList: string): string[] {
  return uriList
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#") && /^(https?:|blob:)/i.test(l))
}

export type DropCollectResult = {
  files: File[]
  /** Email was rebuilt from Outlook text/HTML — attachments will be missing. */
  synthesizedFromText: boolean
}

/**
 * Collect files from a sync capture (drop or paste).
 */
export async function collectDroppedFilesFromCapture(capture: SyncDropCapture): Promise<DropCollectResult> {
  const collected: File[] = []
  const seen = new Set<string>()
  let synthesizedFromText = false

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

  if (!collected.length && capture.handlePromises.length) {
    const handles = await Promise.all(capture.handlePromises)
    for (const handle of handles) {
      if (!handle || handle.kind !== "file" || typeof handle.getFile !== "function") continue
      try {
        await pushUnique(await handle.getFile())
      } catch {
        // ignore
      }
    }
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

  // Outlook often only provides a text/HTML summary — convert to .eml so the drop still works.
  if (!collected.length) {
    const synthesized = outlookTextToEmlFile(capture.textPlain, capture.textHtml)
    if (synthesized) {
      synthesizedFromText = true
      await pushUnique(synthesized)
    }
  }

  if (!collected.length) {
    for (const { data, type } of capture.otherStrings) {
      if (type.includes("html")) {
        const synthesized = outlookTextToEmlFile("", data)
        if (synthesized) {
          synthesizedFromText = true
          await pushUnique(synthesized)
          break
        }
      }
      const fromText = outlookTextToEmlFile(data)
      if (fromText) {
        synthesizedFromText = true
        await pushUnique(fromText)
        break
      }
      const asDownload = parseDownloadURL(data)
      if (asDownload) {
        await pushUnique(await fileFromUrl(asDownload.url, asDownload.name, asDownload.mime))
        if (collected.length) break
      }
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
        // Some New Outlook payloads embed subject/body in JSON
        const subject = typeof json.subject === "string" ? json.subject : ""
        const body =
          (typeof json.body === "string" && json.body) ||
          (typeof json.preview === "string" && json.preview) ||
          (typeof json.text === "string" && json.text) ||
          ""
        if (subject || body) {
          const fake = [
            subject ? `Subject: ${subject}` : null,
            typeof json.from === "string" ? `From: ${json.from}` : "From: unknown@outlook.local",
            typeof json.to === "string" ? `To: ${json.to}` : null,
            "",
            body || subject,
          ].filter(Boolean).join("\r\n")
          const synthesized = outlookTextToEmlFile(fake)
          if (synthesized) {
            synthesizedFromText = true
            await pushUnique(synthesized)
            break
          }
        }
      } catch {
        // not JSON
      }
    }
  }

  return { files: collected, synthesizedFromText }
}

export async function collectDroppedFiles(dt: DataTransfer): Promise<File[]> {
  const result = await collectDroppedFilesFromCapture(captureDropDataSync(dt))
  return result.files
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
  const hasAnyPayload =
    capture.files.length > 0 ||
    !!capture.textPlain ||
    !!capture.textHtml ||
    !!capture.downloadURL ||
    capture.otherStrings.length > 0

  if (!hasAnyPayload) {
    return "Outlook did not share any email data with the browser. Save as .msg or .eml (File → Save As) and choose that file."
  }

  return "Could not import that Outlook drop as a file. Save the email as .msg/.eml and upload it to keep attachments."
}
