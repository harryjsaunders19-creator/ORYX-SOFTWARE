import { fileExt, inferMimeType, isAllowedUpload } from "./constants"

function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
  return cleaned.slice(0, 120) || "file"
}

/**
 * Normalize a dropped/selected file for upload (images + PDFs only).
 */
export async function normalizeDroppedFile(file: File): Promise<File | null> {
  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch {
    return null
  }
  if (buffer.byteLength === 0) return null

  const name = sanitizeFilename(file.name || "file")
  const mime = inferMimeType(name, file.type)
  if (!isAllowedUpload(name, mime)) return null

  if (name === file.name && mime === file.type) return file
  return new File([buffer], name, {
    type: mime,
    lastModified: file.lastModified || Date.now(),
  })
}

type FileSystemHandleLike = { kind: string; getFile?: () => Promise<File> }

export type SyncDropCapture = {
  files: File[]
  handlePromises: Array<Promise<FileSystemHandleLike | null>>
}

/**
 * MUST run synchronously inside the drop handler — browsers clear DataTransfer
 * after the event handler yields.
 */
export function captureDropDataSync(dt: DataTransfer): SyncDropCapture {
  const files: File[] = []
  const handlePromises: Array<Promise<FileSystemHandleLike | null>> = []

  if (dt.items?.length) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i]
      if (!item || item.kind !== "file") continue
      const file = item.getAsFile()
      if (file) files.push(file)

      const getHandle = (item as DataTransferItem & {
        getAsFileSystemHandle?: () => Promise<FileSystemHandleLike>
      }).getAsFileSystemHandle
      if (typeof getHandle === "function") {
        try {
          handlePromises.push(getHandle.call(item).catch(() => null))
        } catch {
          // unsupported
        }
      }
    }
  }

  if (!files.length && dt.files?.length) {
    files.push(...Array.from(dt.files))
  }

  return { files, handlePromises }
}

export type DropCollectResult = {
  files: File[]
  rejected: string[]
}

export async function collectDroppedFilesFromCapture(capture: SyncDropCapture): Promise<DropCollectResult> {
  const collected: File[] = []
  const rejected: string[] = []
  const seen = new Set<string>()

  const pushUnique = async (file: File | null | undefined) => {
    if (!file) return
    const name = file.name || "file"
    const ext = fileExt(name)
    if (ext === ".msg" || ext === ".eml") {
      rejected.push(name)
      return
    }
    const normalized = await normalizeDroppedFile(file)
    if (!normalized) {
      rejected.push(name)
      return
    }
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

  return { files: collected, rejected }
}

export async function collectDroppedFiles(dt: DataTransfer): Promise<File[]> {
  const result = await collectDroppedFilesFromCapture(captureDropDataSync(dt))
  return result.files
}
