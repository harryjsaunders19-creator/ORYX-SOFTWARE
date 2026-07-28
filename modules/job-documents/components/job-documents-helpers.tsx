"use client"

import { FileText, Image as ImageIcon, File } from "lucide-react"
import { documentKind } from "../constants"
import type { JobDocumentRow } from "../types"
import type { DocumentKindFilter } from "../constants"

export const KIND_CHIPS: Array<{ value: "" | DocumentKindFilter; label: string }> = [
  { value: "", label: "All types" },
  { value: "images", label: "Images" },
  { value: "pdfs", label: "PDFs" },
  { value: "emails", label: "Emails" },
  { value: "drawings", label: "Drawings" },
  { value: "calculations", label: "Calculations" },
  { value: "other", label: "Other" },
]

export function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function DocIcon({ doc }: { doc: JobDocumentRow }) {
  const kind = documentKind(doc.mimeType, doc.fileExt)
  if (kind === "images") return <ImageIcon className="h-4 w-4 text-ac" />
  if (kind === "emails") return <FileText className="h-4 w-4 text-ac" />
  if (kind === "pdfs") return <FileText className="h-4 w-4 text-dn" />
  return <File className="h-4 w-4 text-t3" />
}
