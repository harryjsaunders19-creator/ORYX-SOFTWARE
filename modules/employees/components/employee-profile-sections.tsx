"use client"
import { useRef, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { Upload, Trash2, Award, FileText, StickyNote } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import { useToast } from "@/shared/ui/toast"
import { DataPanel, DetailPanel, EmptyPanel } from "@/shared/layouts/page-layout"
import { apiFetch } from "@/shared/hooks/use-api"
import { apiErrorDetail } from "@/shared/utils/error-message"
import type { EmployeeDetail } from "../services/employee-service"

export function SkillsSection({ employeeId, skills, canEdit, onChange }: {
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

export function DocumentsSection({ employeeId, documents, canManage, onChange }: {
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

export function NotesSection({ employeeId, notes, onChange }: {
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
