export async function downloadResponse(res: Response, fallbackName: string) {
  const contentType = res.headers.get("Content-Type") ?? ""
  if (!contentType.includes("spreadsheetml") && !contentType.includes("octet-stream")) {
    const body = await res.text()
    let message = `Download failed (${res.status})`
    try {
      const parsed = JSON.parse(body) as { error?: string }
      if (parsed.error) message = parsed.error
    } catch { /* not JSON */ }
    throw new Error(message)
  }

  const blob = await res.blob()
  if (blob.size < 512) {
    throw new Error("Downloaded file is empty or too small — export may have failed")
  }

  const disposition = res.headers.get("Content-Disposition") ?? ""
  const match = disposition.match(/filename="([^"]+)"/)
  const filename = match?.[1] ?? fallbackName
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
