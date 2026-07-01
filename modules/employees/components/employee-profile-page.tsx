"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { format } from "date-fns"
import {
  Mail, Phone, Building2, Calendar, Upload, Pencil, Trash2,
  FileText, Award, Clock, Activity, StickyNote, Loader2,
} from "lucide-react"
import { useUser } from "@/shared/providers/user-context"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import { useToast } from "@/shared/ui/toast"
import {
  PageShell, BackLink, TabBar, DetailPanel, DataPanel, KpiTile, EmptyPanel,
} from "@/shared/layouts/page-layout"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from "@/shared/ui/dialog"
import { cn } from "@/shared/utils"
import { apiFetch } from "@/shared/hooks/use-api"
import { apiErrorDetail } from "@/shared/utils/error-message"
import type { EmployeeDetail } from "../services/employee-service"
import type { EmployeeAccess } from "../permissions"

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active", ON_LEAVE: "On Leave", SUSPENDED: "Suspended", FORMER: "Former",
}
const EMP_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: "Full Time", PART_TIME: "Part Time", CONTRACTOR: "Contractor", TEMPORARY: "Temporary",
}

type Tab = "personal" | "employment" | "leave" | "skills" | "documents" | "notes" | "activity"

function ProfilePhoto({ userId, name, className }: { userId: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("")
  if (failed) {
    return (
      <div className={cn("flex items-center justify-center rounded-full bg-surface-low font-bold text-t2", className)}>
        {initials || "?"}
      </div>
    )
  }
  return (
    <img
      src={`/api/employees/${userId}/photo?t=${Date.now()}`}
      alt=""
      className={cn("rounded-full border-2 border-bd object-cover bg-surface-low", className)}
      onError={() => setFailed(true)}
    />
  )
}

export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { user: me, isAdmin } = useUser()
  const { toast } = useToast()
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [data, setData] = useState<{ employee: EmployeeDetail; access: EmployeeAccess } | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>("personal")
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/employees/${id}`)
      if (!res.ok) throw new Error(apiErrorDetail(await res.json().catch(() => null), res.status))
      setData(await res.json())
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to load profile", "error")
    } finally {
      setLoading(false)
    }
  }, [id, toast])

  useEffect(() => { load() }, [load])

  const emp = data?.employee
  const access = data?.access ?? "none"
  const canEdit = access === "admin" || access === "manager" || access === "self"
  const canEditEmployment = access === "admin" || access === "manager"
  const canSeeNotes = access === "admin" || access === "manager"
  const isSelf = me?.id === id

  const openEdit = (section: Tab) => {
    if (!emp) return
    const p = emp.profile
    setForm({
      firstName: p.firstName ?? "",
      lastName: p.lastName ?? "",
      preferredName: p.preferredName ?? "",
      phone: p.phone ?? "",
      mobile: p.mobile ?? "",
      address: p.address ?? "",
      city: p.city ?? "",
      county: p.county ?? "",
      postcode: p.postcode ?? "",
      country: p.country ?? "",
      emergencyContactName: p.emergencyContactName ?? "",
      emergencyContactPhone: p.emergencyContactPhone ?? "",
      emergencyContactRelationship: p.emergencyContactRelationship ?? "",
      jobTitle: p.jobTitle ?? "",
      department: p.department ?? "",
      officeLocation: p.officeLocation ?? "",
      employmentType: p.employmentType,
      employmentStatus: p.employmentStatus,
      startDate: p.startDate?.slice(0, 10) ?? "",
      workingHours: p.workingHours ?? "",
    })
    setTab(section)
    setEditOpen(true)
  }

  const saveProfile = async () => {
    setSaving(true)
    try {
      const res = await apiFetch(`/api/employees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(apiErrorDetail(body, res.status))
      toast("Profile updated", "success")
      setEditOpen(false)
      load()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "error")
    } finally {
      setSaving(false)
    }
  }

  const uploadPhoto = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await apiFetch(`/api/employees/${id}/photo`, { method: "POST", body: fd })
      if (!res.ok) throw new Error(apiErrorDetail(await res.json().catch(() => null), res.status))
      toast("Photo updated", "success")
      load()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", "error")
    } finally {
      setUploading(false)
    }
  }

  if (loading && !emp) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-24 text-t4">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </PageShell>
    )
  }

  if (!emp) {
    return (
      <PageShell>
        <BackLink href="/employees">Employees</BackLink>
        <EmptyPanel icon={Building2} title="Employee not found" />
      </PageShell>
    )
  }

  const tabs: { id: Tab; label: string; icon: React.ElementType; hidden?: boolean }[] = [
    { id: "personal", label: "Personal", icon: Mail },
    { id: "employment", label: "Employment", icon: Building2 },
    { id: "leave", label: "Leave", icon: Calendar },
    { id: "skills", label: "Skills", icon: Award },
    { id: "documents", label: "Documents", icon: FileText },
    { id: "notes", label: "Notes", icon: StickyNote, hidden: !canSeeNotes },
    { id: "activity", label: "Activity", icon: Activity },
  ]

  return (
    <PageShell wide>
      <BackLink href="/employees">Employees</BackLink>

      {/* Sticky profile header */}
      <div className="sticky top-0 z-10 -mx-2 mb-6 rounded-xl border border-bd bg-sr/95 px-6 py-5 backdrop-blur-sm shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <ProfilePhoto userId={id} name={emp.name} className="size-20 text-xl" />
            <div>
              <h1 className="text-2xl font-semibold text-t1">{emp.name}</h1>
              <p className="text-sm text-t3">{emp.jobTitle ?? "—"} · {emp.department ?? "No department"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-t3">
                <span className={cn(
                  "rounded-full px-2 py-0.5 font-semibold uppercase",
                  emp.employmentStatus === "ACTIVE" ? "bg-ok-bg text-ok-tx" : "bg-gy-bg text-gy-tx",
                )}>
                  {STATUS_LABELS[emp.employmentStatus]}
                </span>
                {emp.employeeId && <span className="font-mono">{emp.employeeId}</span>}
                {emp.startDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Since {format(new Date(emp.startDate), "d MMM yyyy")}
                  </span>
                )}
                {emp.managerName && <span>Manager: {emp.managerName}</span>}
              </div>
              <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-surface-low">
                <div className="h-full bg-ac transition-all" style={{ width: `${emp.profileCompletion}%` }} />
              </div>
              <p className="mt-0.5 text-[10px] text-t4">{emp.profileCompletion}% profile complete</p>
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
                <Button variant="secondary" size="sm" onClick={() => openEdit("personal")}>
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
                    if (f) uploadPhoto(f)
                    e.target.value = ""
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <TabBar
        tabs={tabs.filter(t => !t.hidden)}
        active={tab}
        onChange={t => setTab(t as Tab)}
      />

      {tab === "personal" && (
        <div className="grid gap-4 md:grid-cols-2">
          <DetailPanel title="Contact">
            <dl className="space-y-2 text-sm">
              <Row label="Email" value={emp.email} />
              <Row label="Phone" value={emp.profile.phone} />
              <Row label="Mobile" value={emp.profile.mobile} />
              <Row label="Preferred name" value={emp.profile.preferredName} />
            </dl>
          </DetailPanel>
          <DetailPanel title="Address">
            <dl className="space-y-2 text-sm">
              <Row label="Address" value={emp.profile.address} />
              <Row label="City" value={emp.profile.city} />
              <Row label="County" value={emp.profile.county} />
              <Row label="Postcode" value={emp.profile.postcode} />
              <Row label="Country" value={emp.profile.country} />
            </dl>
          </DetailPanel>
          {(access !== "none" || isSelf) && (
            <DetailPanel title="Emergency contact" className="md:col-span-2">
              <dl className="grid gap-2 text-sm sm:grid-cols-3">
                <Row label="Name" value={emp.profile.emergencyContactName} />
                <Row label="Phone" value={emp.profile.emergencyContactPhone} />
                <Row label="Relationship" value={emp.profile.emergencyContactRelationship} />
              </dl>
            </DetailPanel>
          )}
        </div>
      )}

      {tab === "employment" && (
        <div className="grid gap-4 md:grid-cols-2">
          <DetailPanel title="Role">
            <dl className="space-y-2 text-sm">
              <Row label="Job title" value={emp.profile.jobTitle} />
              <Row label="Department" value={emp.profile.department} />
              <Row label="Office" value={emp.profile.officeLocation} />
              <Row label="Type" value={EMP_TYPE_LABELS[emp.profile.employmentType]} />
              <Row label="Working hours" value={emp.profile.workingHours} />
            </dl>
            {canEditEmployment && (
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => openEdit("employment")}>Edit employment</Button>
            )}
          </DetailPanel>
          <DetailPanel title="Dates">
            <dl className="space-y-2 text-sm">
              <Row label="Start date" value={emp.profile.startDate ? format(new Date(emp.profile.startDate), "d MMM yyyy") : null} />
              <Row label="Probation ends" value={emp.profile.probationEndDate ? format(new Date(emp.profile.probationEndDate), "d MMM yyyy") : null} />
              <Row label="End date" value={emp.profile.endDate ? format(new Date(emp.profile.endDate), "d MMM yyyy") : null} />
              {emp.yearsOfService != null && <Row label="Years of service" value={String(emp.yearsOfService)} />}
              {emp.profile.salary != null && isAdmin && (
                <Row label="Salary" value={`£${emp.profile.salary.toLocaleString()}`} />
              )}
            </dl>
          </DetailPanel>
        </div>
      )}

      {tab === "leave" && (
        <LeaveTab
          employeeId={id}
          emp={emp}
          canRequest={isSelf || canEditEmployment}
          canReview={isAdmin}
          onChange={load}
        />
      )}

      {tab === "skills" && (
        <SkillsSection employeeId={id} skills={emp.skills} canEdit={canEdit} onChange={load} />
      )}

      {tab === "documents" && (
        <DocumentsSection employeeId={id} documents={emp.documents} canManage={canEditEmployment || isSelf} onChange={load} />
      )}

      {tab === "notes" && canSeeNotes && (
        <NotesSection employeeId={id} notes={emp.notes ?? []} onChange={load} />
      )}

      {tab === "activity" && (
        <DataPanel noPadding>
          {emp.activity.length === 0 ? (
            <EmptyPanel icon={Clock} title="No activity yet" />
          ) : (
            <ul className="divide-y divide-bd">
              {emp.activity.map(a => (
                <li key={a.id} className="flex gap-3 px-4 py-3 text-sm">
                  <div className="mt-0.5 size-2 shrink-0 rounded-full bg-ac" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-t1">{a.action.replace(/_/g, " ")}</p>
                    {a.detail && <p className="text-xs text-t3">{a.detail}</p>}
                    <p className="text-[10px] text-t4 mt-0.5">
                      {a.performedByName} · {format(new Date(a.createdAt), "d MMM yyyy HH:mm")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DataPanel>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>Edit profile</DialogTitle></DialogHeader>
          <DialogBody>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name" value={form.firstName} onChange={v => setForm(f => ({ ...f, firstName: v }))} />
              <Field label="Last name" value={form.lastName} onChange={v => setForm(f => ({ ...f, lastName: v }))} />
              <Field label="Preferred name" value={form.preferredName} onChange={v => setForm(f => ({ ...f, preferredName: v }))} className="sm:col-span-2" />
              <Field label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
              <Field label="Mobile" value={form.mobile} onChange={v => setForm(f => ({ ...f, mobile: v }))} />
              {canEditEmployment && (
                <>
                  <Field label="Job title" value={form.jobTitle} onChange={v => setForm(f => ({ ...f, jobTitle: v }))} />
                  <Field label="Department" value={form.department} onChange={v => setForm(f => ({ ...f, department: v }))} />
                </>
              )}
              <Field label="Address" value={form.address} onChange={v => setForm(f => ({ ...f, address: v }))} className="sm:col-span-2" />
              <Field label="City" value={form.city} onChange={v => setForm(f => ({ ...f, city: v }))} />
              <Field label="Postcode" value={form.postcode} onChange={v => setForm(f => ({ ...f, postcode: v }))} />
              <Field label="Emergency contact" value={form.emergencyContactName} onChange={v => setForm(f => ({ ...f, emergencyContactName: v }))} />
              <Field label="Emergency phone" value={form.emergencyContactPhone} onChange={v => setForm(f => ({ ...f, emergencyContactPhone: v }))} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={saveProfile}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-t4">{label}</dt>
      <dd className="text-t1">{value?.trim() ? value : "—"}</dd>
    </div>
  )
}

function Field({ label, value, onChange, className }: {
  label: string; value: string; onChange: (v: string) => void; className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label>{label}</Label>
      <Input value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function SkillsSection({ employeeId, skills, canEdit, onChange }: {
  employeeId: string
  skills: EmployeeDetail["skills"]
  canEdit: boolean
  onChange: () => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState("")
  const [level, setLevel] = useState("")

  const add = async () => {
    if (!name.trim()) return
    const res = await apiFetch(`/api/employees/${employeeId}/skills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, level }),
    })
    if (!res.ok) { toast(apiErrorDetail(await res.json().catch(() => null), res.status), "error"); return }
    setName(""); setLevel(""); toast("Skill added", "success"); onChange()
  }

  const remove = async (skillId: string) => {
    const res = await apiFetch(`/api/employees/${employeeId}/skills/${skillId}`, { method: "DELETE" })
    if (!res.ok) { toast("Could not remove skill", "error"); return }
    onChange()
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Skill name" value={name} onChange={e => setName(e.target.value)} className="max-w-xs" />
          <Input placeholder="Level" value={level} onChange={e => setLevel(e.target.value)} className="max-w-[120px]" />
          <Button variant="primary" size="sm" onClick={add}>Add</Button>
        </div>
      )}
      <DataPanel noPadding>
        {skills.length === 0 ? (
          <EmptyPanel icon={Award} title="No skills recorded" />
        ) : (
          <ul className="divide-y divide-bd">
            {skills.map(s => (
              <li key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-t1">{s.name}</p>
                  <p className="text-xs text-t3">{s.category}{s.level ? ` · ${s.level}` : ""}</p>
                </div>
                {canEdit && (
                  <Button variant="ghost" size="icon-sm" onClick={() => remove(s.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DataPanel>
    </div>
  )
}

function DocumentsSection({ employeeId, documents, canManage, onChange }: {
  employeeId: string
  documents: EmployeeDetail["documents"]
  canManage: boolean
  onChange: () => void
}) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [docName, setDocName] = useState("")

  const upload = async (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    fd.append("name", docName || file.name)
    fd.append("category", "OTHER")
    const res = await apiFetch(`/api/employees/${employeeId}/documents`, { method: "POST", body: fd })
    if (!res.ok) { toast(apiErrorDetail(await res.json().catch(() => null), res.status), "error"); return }
    setDocName(""); toast("Document uploaded", "success"); onChange()
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label>Document name</Label>
            <Input value={docName} onChange={e => setDocName(e.target.value)} placeholder="Optional label" className="max-w-xs" />
          </div>
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Upload
          </Button>
          <input ref={fileRef} type="file" className="hidden" onChange={e => {
            const f = e.target.files?.[0]
            if (f) upload(f)
            e.target.value = ""
          }} />
        </div>
      )}
      <DataPanel noPadding>
        {documents.length === 0 ? (
          <EmptyPanel icon={FileText} title="No documents" />
        ) : (
          <ul className="divide-y divide-bd">
            {documents.map(d => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-t1">{d.name}</p>
                  <p className="text-xs text-t3">{d.category} · {format(new Date(d.createdAt), "d MMM yyyy")} · {d.uploadedByName}</p>
                </div>
                <Link href={`/api/employees/${employeeId}/documents/${d.id}`} className="text-xs font-medium text-ac hover:underline">
                  Download
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DataPanel>
    </div>
  )
}

function NotesSection({ employeeId, notes, onChange }: {
  employeeId: string
  notes: NonNullable<EmployeeDetail["notes"]>
  onChange: () => void
}) {
  const { toast } = useToast()
  const [content, setContent] = useState("")

  const save = async () => {
    if (!content.trim()) return
    const res = await apiFetch(`/api/employees/${employeeId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) { toast("Failed to save note", "error"); return }
    setContent(""); toast("Note added", "success"); onChange()
  }

  return (
    <div className="space-y-4">
      <DetailPanel title="Add internal note">
        <Textarea value={content} onChange={e => setContent(e.target.value)} rows={4} placeholder="Private note visible to managers and admins only…" />
        <Button variant="primary" size="sm" className="mt-2" onClick={save}>Save note</Button>
      </DetailPanel>
      <DataPanel noPadding>
        {notes.length === 0 ? (
          <EmptyPanel icon={StickyNote} title="No notes yet" />
        ) : (
          <ul className="divide-y divide-bd">
          </ul>
        )}
      </DataPanel>
    </div>
  )
}

function LeaveTab({
  employeeId,
  emp,
  canRequest,
  canReview,
  onChange,
}: {
  employeeId: string
  emp: EmployeeDetail
  canRequest: boolean
  canReview: boolean
  onChange: () => void
}) {
  const { toast } = useToast()
  const [requests, setRequests] = useState<Array<{
    id: string; startDate: string; endDate: string; status: string
    leaveType: string; reason: string | null; userName: string
  }>>([])
  const [loadingReqs, setLoadingReqs] = useState(true)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const loadRequests = useCallback(() => {
    setLoadingReqs(true)
    fetch(`/api/leave/requests?userId=${employeeId}`)
      .then(r => r.ok ? r.json() as Promise<{ requests: typeof requests }> : null)
      .then(d => { if (d) setRequests(d.requests) })
      .catch(() => {})
      .finally(() => setLoadingReqs(false))
  }, [employeeId])

  useEffect(() => { loadRequests() }, [loadRequests, emp.leave.upcoming.length])

  const submitRequest = async () => {
    if (!startDate || !endDate) {
      toast("Start and end dates are required", "error")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/leave/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: employeeId, startDate, endDate, reason: reason || null }),
      })
      if (!res.ok) throw new Error(apiErrorDetail(await res.json().catch(() => null), res.status))
      toast("Leave request submitted", "success")
      setStartDate("")
      setEndDate("")
      setReason("")
      onChange()
      loadRequests()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Request failed", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const review = async (requestId: string, action: "approve" | "reject") => {
    try {
      const res = await fetch(`/api/leave/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error(apiErrorDetail(await res.json().catch(() => null), res.status))
      toast(action === "approve" ? "Leave accepted" : "Leave declined", "success")
      onChange()
      setRequests(prev => prev.map(r => r.id === requestId
        ? { ...r, status: action === "approve" ? "APPROVED" : "REJECTED" }
        : r))
    } catch (e) {
      toast(e instanceof Error ? e.message : "Action failed", "error")
    }
  }

  const pending = requests.filter(r => r.status === "PENDING")

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiTile label="Annual allowance" value={emp.leave.annualLeaveAllowance} accent="#111827" />
        <KpiTile label="Taken" value={emp.leave.leaveTaken} accent="#76777d" />
        <KpiTile label="Remaining" value={emp.leave.remaining} accent="#0E7A6E" />
      </div>

      {canRequest && (
        <DetailPanel title="Request leave">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Start date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">End date</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1 h-9 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Reason (optional)</Label>
              <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="mt-1 text-sm" />
            </div>
          </div>
          <Button variant="primary" size="sm" className="mt-3" disabled={submitting} onClick={submitRequest}>
            {submitting ? "Submitting…" : "Submit request"}
          </Button>
        </DetailPanel>
      )}

      {canReview && pending.length > 0 && (
        <DataPanel noPadding>
          <div className="border-b border-bd px-4 py-3 font-semibold text-sm text-t1">Pending approval (admin)</div>
          <ul className="divide-y divide-bd">
            {pending.map(r => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span>
                  {format(new Date(r.startDate), "d MMM")} – {format(new Date(r.endDate), "d MMM yyyy")}
                  {r.reason && <span className="text-t3 ml-2">({r.reason})</span>}
                </span>
                <span className="flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => review(r.id, "approve")}>Accept</Button>
                  <Button size="sm" variant="outline" onClick={() => review(r.id, "reject")}>Decline</Button>
                </span>
              </li>
            ))}
          </ul>
        </DataPanel>
      )}

      <DataPanel noPadding>
        <div className="border-b border-bd px-4 py-3 font-semibold text-sm text-t1">Upcoming leave</div>
        {emp.leave.upcoming.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-t4">No upcoming leave</p>
        ) : (
          <ul className="divide-y divide-bd">
            {emp.leave.upcoming.map(e => (
              <li key={e.id} className="flex justify-between px-4 py-2.5 text-sm">
                <span>{e.title}</span>
                <span className="text-t3 tabular-nums">
                  {format(new Date(e.startDate), "d MMM")} – {format(new Date(e.endDate), "d MMM yyyy")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DataPanel>

      {!loadingReqs && requests.length > 0 && (
        <DataPanel noPadding>
          <div className="border-b border-bd px-4 py-3 font-semibold text-sm text-t1">All requests</div>
          <ul className="divide-y divide-bd">
            {requests.slice(0, 15).map(r => (
              <li key={r.id} className="flex justify-between px-4 py-2.5 text-sm">
                <span>{format(new Date(r.startDate), "d MMM")} – {format(new Date(r.endDate), "d MMM yyyy")}</span>
                <span className="text-xs font-medium uppercase text-t3">{r.status}</span>
              </li>
            ))}
          </ul>
        </DataPanel>
      )}
    </div>
  )
}
