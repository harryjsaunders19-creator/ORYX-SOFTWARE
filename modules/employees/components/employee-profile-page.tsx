"use client"
import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import {
  Mail, Building2, Calendar, Clock, FileText, Award, StickyNote, Activity, Loader2,
} from "lucide-react"
import { format } from "date-fns"
import { useUser } from "@/shared/providers/user-context"
import { useToast } from "@/shared/ui/toast"
import {
  PageShell, BackLink, TabBar, DataPanel, EmptyPanel,
} from "@/shared/layouts/page-layout"
import { apiFetch } from "@/shared/hooks/use-api"
import { apiErrorDetail } from "@/shared/utils/error-message"
import type { EmployeeDetail } from "../services/employee-service"
import type { EmployeeAccess } from "../permissions"
import { type Tab } from "./employee-profile-primitives"
import { EmployeeProfileHeader } from "./employee-profile-header"
import { EmployeeProfileEditDialog } from "./employee-profile-edit-dialog"
import { PersonalPanel, EmploymentPanel } from "./employee-profile-personal"
import { SkillsSection, DocumentsSection, NotesSection } from "./employee-profile-sections"
import { LeaveTab } from "./employee-profile-leave-tab"

export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { user: me, isAdmin } = useUser()
  const { toast } = useToast()

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
          <Loader2 className="h-5 w-5 animate-spin" />
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

      <EmployeeProfileHeader
        id={id}
        emp={emp}
        canEdit={canEdit}
        uploading={uploading}
        onEditClick={() => openEdit("personal")}
        onPhotoUpload={uploadPhoto}
      />

      <TabBar
        tabs={tabs.filter(t => !t.hidden)}
        active={tab}
        onChange={t => setTab(t as Tab)}
      />

      {tab === "personal" && (
        <PersonalPanel emp={emp} access={access} isSelf={isSelf} />
      )}

      {tab === "employment" && (
        <EmploymentPanel
          emp={emp}
          isAdmin={isAdmin}
          canEditEmployment={canEditEmployment}
          onEditEmployment={() => openEdit("employment")}
        />
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
                    <p className="type-helper text-t4 mt-0.5">
                      {a.performedByName} · {format(new Date(a.createdAt), "d MMM yyyy HH:mm")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DataPanel>
      )}

      <EmployeeProfileEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        saving={saving}
        form={form}
        onFormChange={(key, value) => setForm(f => ({ ...f, [key]: value }))}
        onSave={saveProfile}
        canEditEmployment={canEditEmployment}
      />
    </PageShell>
  )
}
