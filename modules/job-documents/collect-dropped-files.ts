import { fileExt, inferMimeType } from "./constants"

/** OLE compound document header used by Outlook .msg files. */
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const

function looksLikeMsg(bytes: Uint8Array): boolean {
  if (bytes.length < OLE_MAGIC.length) return false
  return OLE_MAGIC.every((b, i) => bytes[i] === b)
}

function looksLikeEml(textStart: string): boolean {
  const head = textStart.slice(0, 512).toLowerCase()
  return (
    head.startsWith("from:") ||
    head.startsWith("received:") ||
    head.startsWith("return-path:") ||
    head.startsWith("mime-version:") ||
    head.includes("\nfrom:") ||
    head.includes("\nsubject:")
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
export async function normalizeDroppedFile(file: File): Promise<File> {
  let name = sanitizeFilename(file.name || "email")
  let mime = file.type || ""
  let ext = fileExt(name)

  if (!ext) {
    try {
      const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer())
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
        } else if (
          mime === "application/vnd.ms-outlook" ||
          mime === "message/rfc822"
        ) {
          name = `${name}${mime.includes("outlook") ? ".msg" : ".eml"}`
          ext = fileExt(name)
        }
      }
    } catch {
      // Fall through — keep the original file if sniffing fails.
    }
  }

  // Classic Outlook sometimes reports application/octet-stream for .msg
  if (ext === ".msg" && (!mime || mime === "application/octet-stream")) {
    mime = "application/vnd.ms-outlook"
  }
  if (ext === ".eml" && (!mime || mime === "application/octet-stream" || mime === "text/plain")) {
    mime = "message/rfc822"
  }

  const inferred = inferMimeType(name, mime)
  if (name === file.name && inferred === file.type) return file
  return new File([file], name, {
    type: inferred,
    lastModified: file.lastModified,
  })
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise(resolve => {
    entry.file(
      file => resolve(file),
      () => resolve(null),
    )
  })
}

/**
 * Parse Chromium DownloadURL drag payload: `mimeType:fileName:url`
 * Used by New Outlook / some shell drops.
 */
function parseDownloadURL(raw: string): { mime: string; name: string; url: string } | null {
  const first = raw.indexOf(":")
  const second = raw.indexOf(":", first + 1)
  if (first <= 0 || second <= first) return null
  const mime = raw.slice(0, first).trim()
  const name = raw.slice(first + 1, second).trim()
  const url = raw.slice(second + 1).trim()
  if (!name || !url) return null
  return { mime, name, url }
}

async function filesFromDownloadURL(dt: DataTransfer): Promise<File[]> {
  const types = Array.from(dt.types ?? [])
  const key = types.find(t => t.toLowerCase() === "downloadurl")
  if (!key) return []

  const raw = dt.getData(key)
  if (!raw) return []

  const parsed = parseDownloadURL(raw)
  if (!parsed) return []

  try {
    const res = await fetch(parsed.url)
    if (!res.ok) return []
    const blob = await res.blob()
    const type = blob.type || parsed.mime || "application/octet-stream"
    return [new File([blob], sanitizeFilename(parsed.name), { type })]
  } catch {
    return []
  }
}

/**
 * Collect files from a drop event, including Outlook virtual .msg/.eml drops
 * that only appear on `dataTransfer.items` (not always on `.files`).
 */
export async function collectDroppedFiles(dt: DataTransfer): Promise<File[]> {
  const collected: File[] = []
  const seen = new Set<string>()

  const pushUnique = async (file: File | null | undefined) => {
    if (!file || file.size <= 0) return
    const key = `${file.name}:${file.size}:${file.lastModified}`
    if (seen.has(key)) return
    seen.add(key)
    collected.push(await normalizeDroppedFile(file))
  }

  const items = dt.items
  if (items?.length) {
    const tasks: Array<Promise<void>> = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item || item.kind !== "file") continue

      const entry = typeof item.webkitGetAsEntry === "function"
        ? item.webkitGetAsEntry()
        : null

      if (entry && "isFile" in entry && entry.isFile) {
        tasks.push(
          readFileEntry(entry as FileSystemFileEntry).then(file => pushUnique(file)),
        )
      } else {
        tasks.push(pushUnique(item.getAsFile()))
      }
    }
    await Promise.all(tasks)
  }

  if (!collected.length && dt.files?.length) {
    for (const file of Array.from(dt.files)) {
      await pushUnique(file)
    }
  }

  if (!collected.length) {
    for (const file of await filesFromDownloadURL(dt)) {
      await pushUnique(file)
    }
  }

  return collected
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
