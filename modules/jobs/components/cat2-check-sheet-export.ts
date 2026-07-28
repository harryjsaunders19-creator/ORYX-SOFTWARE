/**
 * Pure browser helper — no React. Fetches the CAT II check sheet PDF for a job,
 * triggers a file download, and returns a discriminated result. Toast/mutate
 * side-effects stay in the calling page handler.
 */
export async function downloadCat2CheckSheet(
  jobId: string,
): Promise<{ ok: true; filename: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/jobs/${jobId}/cat2-check-sheet`, { method: "POST" })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      return { ok: false, error: body.error ?? "CAT II export failed" }
    }
    const blob = await res.blob()
    const cd = res.headers.get("Content-Disposition") ?? ""
    const match = cd.match(/filename="([^"]+)"/i)
    const filename = match?.[1] || "CATII Check Certificate.pdf"
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    return { ok: true, filename }
  } catch {
    return { ok: false, error: "CAT II export failed" }
  }
}
