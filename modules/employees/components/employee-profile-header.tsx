"use client"
import { useRef, useState } from "react"
import Image from "next/image"
import { format } from "date-fns"
import { Mail, Phone, Calendar, Upload, Pencil } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/utils"
import { STATUS_LABELS } from "./employee-profile-primitives"
import type { EmployeeDetail } from "../services/employee-service"

function ProfilePhoto({ userId, name, className }: { userId: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  const [photoCacheBust] = useState(() => Date.now())
  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("")
  if (failed) {
    return (
      <div className={cn("flex items-center justify-center rounded-full bg-surface-low font-bold text-t2", className)}>
        {initials || "?"}
      </div>
    )
  }
  return (
    <Image
      src={`/api/employees/${userId}/photo?t=${photoCacheBust}`}
      alt=""
      width={80}
      height={80}
      unoptimized
      className={cn("rounded-full border-2 border-bd object-cover bg-surface-low", className)}
      onError={() => setFailed(true)}
    />
  )
}

export interface EmployeeProfileHeaderProps {
  id: string
  emp: EmployeeDetail
  canEdit: boolean
  uploading: boolean
  onEditClick: () => void
  onPhotoUpload: (file: File) => void
}

export function EmployeeProfileHeader({
  id, emp, canEdit, uploading, onEditClick, onPhotoUpload,
}: EmployeeProfileHeaderProps) {
  const photoInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="sticky top-0 z-10 -mx-2 mb-6 rounded-xl border border-bd bg-sr/95 px-6 py-5 backdrop-blur-sm shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <ProfilePhoto userId={id} name={emp.name} className="size-20 text-xl" />
          <div>
            <h1 className="type-page-title text-t1">{emp.name}</h1>
            <p className="text-sm text-t3">{emp.jobTitle ?? "—"} · {emp.department ?? "No department"}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-t3">
              <span className={cn(
                "rounded-md px-2 py-0.5 type-badge",
                emp.employmentStatus === "ACTIVE" ? "bg-ok-bg text-ok-tx" : "bg-gy-bg text-gy-tx",
              )}>
                {STATUS_LABELS[emp.employmentStatus]}
              </span>
              {emp.employeeId && <span className="type-drawing-number">{emp.employeeId}</span>}
              {emp.startDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Since {format(new Date(emp.startDate), "d MMM yyyy")}
                </span>
              )}
              {emp.managerName && <span>Manager: {emp.managerName}</span>}
            </div>
            <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-surface-low">
              <div className="h-full bg-ac transition-all" style={{ width: `${emp.profileCompletion}%` }} />
            </div>
            <p className="mt-0.5 type-helper text-t4">{emp.profileCompletion}% profile complete</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {emp.email && (
            <Button variant="outline" size="sm" asChild>
              <a href={`mailto:${emp.email}`}><Mail className="h-3.5 w-3.5" /> Email</a>
            </Button>
          )}
          {emp.phone && (
            <Button variant="outline" size="sm" asChild>
              <a href={`tel:${emp.phone}`}><Phone className="h-3.5 w-3.5" /> Call</a>
            </Button>
          )}
          {canEdit && (
            <>
              <Button variant="secondary" size="sm" onClick={onEditClick}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button variant="secondary" size="sm" loading={uploading} onClick={() => photoInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" /> Photo
              </Button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) onPhotoUpload(f)
                  e.target.value = ""
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
