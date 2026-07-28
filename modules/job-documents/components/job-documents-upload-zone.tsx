"use client"

import type { DragEvent, RefObject } from "react"
import { Upload } from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/ui/select"
import { cn } from "@/shared/utils/utils"
import { JOB_DOCUMENT_CATEGORIES } from "../constants"

export function JobDocumentsUploadZone({
  writeOk,
  showTitle,
  total,
  uploading,
  uploadCategory,
  onUploadCategoryChange,
  attachToRevision,
  onAttachToRevisionChange,
  fileInputRef,
  onFilesSelected,
  dragOver,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  writeOk: boolean
  showTitle: boolean
  total: number
  uploading: boolean
  uploadCategory: string
  onUploadCategoryChange: (c: string) => void
  attachToRevision: boolean
  onAttachToRevisionChange: (v: boolean) => void
  fileInputRef: RefObject<HTMLInputElement | null>
  onFilesSelected: (files: FileList) => void
  dragOver: boolean
  onDragEnter: (e: DragEvent<HTMLDivElement>) => void
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
}) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {showTitle ? (
            <h2 className="text-lg font-semibold text-t1">Documents</h2>
          ) : null}
          <p className={cn("text-sm text-t3", showTitle ? "mt-0.5" : "")}>
            {total} file{total === 1 ? "" : "s"} — PDFs and images (print emails to PDF)
          </p>
        </div>
        {writeOk && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={uploadCategory} onValueChange={onUploadCategoryChange}>
              <SelectTrigger className="h-9 w-[160px] text-sm">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {JOB_DOCUMENT_CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1.5 text-sm text-t3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={attachToRevision}
                onChange={e => onAttachToRevisionChange(e.target.checked)}
                className="rounded border-bd"
              />
              Current revision
            </label>
            <Button
              type="button"
              size="sm"
              variant="primary"
              loading={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" /> Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,application/pdf,image/*"
              className="hidden"
              onChange={e => e.target.files && onFilesSelected(e.target.files)}
            />
          </div>
        )}
      </div>

      {writeOk && (
        <div
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={cn(
            "rounded-lg border border-dashed px-4 py-7 text-center transition-colors",
            dragOver ? "border-ac bg-ac/5" : "border-bd bg-pg/30",
            uploading && "pointer-events-none opacity-60",
          )}
        >
          <p className="text-base text-t2">Drag & drop PDFs or images here</p>
          <p className="text-sm text-t4 mt-1">
            For emails, print to PDF first — then upload. Up to 50 MB each.
          </p>
        </div>
      )}
    </>
  )
}
