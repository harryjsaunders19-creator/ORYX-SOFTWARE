"use client"

import { useEffect, useCallback } from "react"
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react"
import { cn } from "@/shared/utils/utils"
import type { JobDocumentRow } from "../types"

export function DocumentLightbox({
  images,
  index,
  jobId,
  onClose,
  onNavigate,
}: {
  images: JobDocumentRow[]
  index: number
  jobId: string
  onClose: () => void
  onNavigate: (next: number) => void
}) {
  const current = images[index]
  const previewUrl = current
    ? `/api/jobs/${jobId}/documents/${current.id}/preview`
    : null

  const go = useCallback((delta: number) => {
    if (!images.length) return
    const next = (index + delta + images.length) % images.length
    onNavigate(next)
  }, [images.length, index, onNavigate])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft") go(-1)
      if (e.key === "ArrowRight") go(1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go, onClose])

  if (!current || !previewUrl) return null

  return (
    <div
      className="fixed inset-0 z-[280] flex flex-col bg-black/85"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" onClick={e => e.stopPropagation()}>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{current.filename}</p>
          <p className="text-xs text-white/70">{index + 1} / {images.length}</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/jobs/${jobId}/documents/${current.id}/download`}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-2.5 py-1.5 text-xs hover:bg-white/10"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </a>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 hover:bg-white/10" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="relative flex-1 flex items-center justify-center px-12 pb-8" onClick={e => e.stopPropagation()}>
        {images.length > 1 && (
          <>
            <button
              type="button"
              className={cn("absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20")}
              onClick={() => go(-1)}
              aria-label="Previous image"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              onClick={() => go(1)}
              aria-label="Next image"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={current.filename}
          className="max-h-full max-w-full object-contain rounded shadow-2xl"
        />
      </div>
    </div>
  )
}
