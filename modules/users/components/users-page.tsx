"use client"
import { useCallback, useEffect, useState } from "react"
import { format } from "date-fns"
import { Plus, UserX, UserCheck, ShieldCheck, Trash2, KeyRound, Copy } from "lucide-react"
import { Button }   from "@/shared/ui/button"
import { Input }    from "@/shared/ui/input"
import { Label }    from "@/shared/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogBody,
} from "@/shared/ui/dialog"
import { useToast } from "@/shared/ui/toast"
import { useUser }  from "@/shared/providers/user-context"
import { RequireRole } from "@/components/require-role"
import { PageHeader, PageShell, DataPanel } from "@/shared/layouts/page-layout"
import { cn } from "@/shared/utils/utils"
import { MODULES, ROLES } from "@/shared/auth/permissions"
import type { User, Role } from "@/lib/types"

type UsersData = { users: User[]; total: number }
const ENGINEER_MODULES = MODULES.filter(m => m.roles.includes("ENGINEER"))

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 type-badge whitespace-nowrap",
      role === "ADMIN" ? "bg-ac-bg text-ac" : "bg-t1/[0.06] text-t2",
    )}>
      {role === "ADMIN" && <ShieldCheck className="h-3.5 w-3.5" />}
      {role === "ADMIN" ? "Admin" : "Engineer"}
    </span>
  )
}

function UserForm({ formId, initial, onSubmit }: {
  formId: string
  initial: { name: string; email: string; role: Role; moduleAccess: string[] | null }
  onSubmit: (data: { name: string; email: string; role: Role; moduleAccess: string[] | null }) => void
}) {
  const [name,  setName]  = useState(initial.name)
  const [email, setEmail] = useState(initial.email)
  const [role,  setRole]  = useState<Role>(initial.role)
  const [moduleAccess, setModuleAccess] = useState<string[] | null>(initial.moduleAccess)

  return (
    <form id={formId} onSubmit={e => { e.preventDefault(); onSubmit({ name: name.trim(), email: email.trim(), role, moduleAccess }) }} className="space-y-3">
      <div className="flex flex-col gap-1.5">
        <Label>Name *</Label>
        <Input value={name} onChange={e => setName(e.target.value)} autoFocus required placeholder="Jane Smith" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Email</Label>
        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@oryxdesign.co.uk" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Role</Label>
        <Select value={role} onValueChange={v => setRole(v as Role)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROLES.map(r => <SelectItem key={r} value={r}>{r === "ADMIN" ? "Admin" : "Engineer"}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-t4">New users default to Engineer — promote to Admin deliberately.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label>Module access</Label>
        {role === "ADMIN" ? (
          <p className="text-xs text-t4">Admins always have full module access.</p>
        ) : (
          <>
            <p className="text-xs text-t4">Toggle what this engineer can see in the sidebar and open directly.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {ENGINEER_MODULES.map(module => {
                const enabled = moduleAccess == null || moduleAccess.includes(module.key)
                return (
                  <button
                    key={module.key}
                    type="button"
                    aria-pressed={enabled}
                    onClick={() => {
                      const current = moduleAccess ?? ENGINEER_MODULES.map(m => m.key)
                      const next = enabled
                        ? current.filter(k => k !== module.key)
                        : [...current, module.key]
                      setModuleAccess(next)
                    }}
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
                      enabled
                        ? "border-ac/30 bg-ac-bg text-ac"
                        : "border-bd bg-transparent text-t3 hover:border-ac/30",
                    )}
                  >
                    {module.label}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </form>
  )
}

function UsersPageInner() {
  const { toast }    = useToast()
  const { user: me }  = useUser()
  const [data,       setData]       = useState<UsersData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser,   setEditUser]   = useState<User | null>(null)
  const [deleteUser, setDeleteUser] = useState<User | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [tempPasswordInfo, setTempPasswordInfo] = useState<{ name: string; email: string; password: string } | null>(null)
  const [resetting,  setResetting]  = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/users")
      if (!res.ok) throw new Error()
      setData(await res.json() as UsersData)
    } catch { toast("Failed to load users", "error") }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  const doCreate = async (d: { name: string; email: string; role: Role; moduleAccess: string[] | null }) => {
    setSaving(true)
    try {
      const res = await fetch("/api/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: d.name, email: d.email, role: d.role, moduleAccess: d.role === "ADMIN" ? null : d.moduleAccess }),
      })
      const body = await res.json() as { user?: User; tempPassword?: string; error?: string }
      if (!res.ok) { toast(body.error ?? "Failed to create user", "error"); return }
      setCreateOpen(false)
      setTempPasswordInfo({ name: d.name, email: d.email, password: body.tempPassword! })
      load()
    } catch { toast("Network error", "error") }
    finally { setSaving(false) }
  }

  const doResetPassword = async (u: User) => {
    setResetting(u.id)
    try {
      const res = await fetch(`/api/users/${u.id}/reset-password`, { method: "POST" })
      const body = await res.json() as { tempPassword?: string; error?: string }
      if (!res.ok) { toast(body.error ?? "Failed to reset password", "error"); return }
      setTempPasswordInfo({ name: u.name, email: u.email ?? "", password: body.tempPassword! })
    } catch { toast("Network error", "error") }
    finally { setResetting(null) }
  }

  const doEdit = async (d: { name: string; email: string; role: Role; moduleAccess: string[] | null }) => {
    if (!editUser) return
    setSaving(true)
    try {
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: d.name,
          email: d.email || null,
          role: d.role,
          moduleAccess: d.role === "ADMIN" ? null : d.moduleAccess,
        }),
      })
      const body = await res.json() as User & { error?: string }
      if (!res.ok) { toast(body.error ?? "Failed to save", "error"); return }
      toast("Saved", "success"); setEditUser(null); load()
    } catch { toast("Network error", "error") }
    finally { setSaving(false) }
  }

  const toggleActive = async (u: User) => {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: u.active ? false : true }),
    })
    const body = await res.json() as User & { error?: string }
    if (!res.ok) { toast(body.error ?? "Failed", "error"); return }
    toast(u.active ? `${u.name} disabled` : `${u.name} re-enabled`, u.active ? "info" : "success")
    load()
  }

  return (
    <PageShell wide>
      <PageHeader
        title="Users"
        description={`${data?.total ?? 0} user${data?.total !== 1 ? "s" : ""}`}
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New user
          </Button>
        }
      />

      {loading ? (
        <DataPanel>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 border-b border-bd last:border-0 px-4 flex items-center">
              <div className="skeleton h-4 w-48 rounded" />
            </div>
          ))}
        </DataPanel>
      ) : (
        <DataPanel className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-surface-low border-b border-bd text-xs">
                <th className="px-4 py-2.5 text-left font-semibold text-t3">Name</th>
                <th className="px-4 py-2.5 text-left font-semibold text-t3">Email</th>
                <th className="px-4 py-2.5 text-left font-semibold text-t3">Role</th>
                <th className="px-4 py-2.5 text-left font-semibold text-t3">Status</th>
                <th className="px-4 py-2.5 text-left font-semibold text-t3">Added</th>
                <th className="px-4 py-2.5 w-44" />
              </tr>
            </thead>
            <tbody>
              {data?.users.map(u => (
                <tr key={u.id} className={cn("border-b border-bd last:border-0 hover:bg-pg", !u.active && "opacity-60")}>
                  <td className="px-4 py-3">
                    <span className="font-medium text-t1">{u.name}</span>
                    {me?.id === u.id && <span className="type-helper text-t4 ml-1.5">(you)</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-t3">{u.email ?? "—"}</td>
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3">
                    {u.active ? (
                      <span className="type-badge text-ok-tx">Active</span>
                    ) : (
                      <span className="type-badge text-t4">Disabled</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-t4 tabular-nums whitespace-nowrap">{format(new Date(u.createdAt), "d MMM yyyy")}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setEditUser(u)}>Edit</Button>
                      {u.active ? (
                        <Button variant="ghost" size="icon-sm" onClick={() => toggleActive(u)} title="Disable" className="text-t4 hover:text-dn">
                          <UserX className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon-sm" onClick={() => toggleActive(u)} title="Re-enable" className="text-t4 hover:text-ac">
                          <UserCheck className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost" size="icon-sm"
                        onClick={() => doResetPassword(u)}
                        title="Reset password"
                        className="text-t4 hover:text-ac"
                        disabled={resetting === u.id}
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleteUser(u)} title="Delete" className="text-t4 hover:text-dn">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataPanel>
      )}

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={o => { if (!o) setCreateOpen(false) }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>New user</DialogTitle></DialogHeader>
          <DialogBody>
            <UserForm formId="create-user-form" initial={{ name: "", email: "", role: "ENGINEER", moduleAccess: null }} onSubmit={doCreate} />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="create-user-form" variant="primary" loading={saving}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editUser} onOpenChange={o => { if (!o) setEditUser(null) }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Edit user</DialogTitle></DialogHeader>
          <DialogBody>
            {editUser && (
              <UserForm
                formId="edit-user-form"
                initial={{
                  name: editUser.name,
                  email: editUser.email ?? "",
                  role: editUser.role,
                  moduleAccess: editUser.moduleAccess,
                }}
                onSubmit={doEdit}
              />
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="edit-user-form" variant="primary" loading={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteUser} onOpenChange={o => { if (!o && !deleting) setDeleteUser(null) }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete user</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-t2">
              Permanently delete <span className="font-semibold text-t1">{deleteUser?.name}</span>?
            </p>
            {deleteUser?.id === me?.id && (
              <p className="text-xs text-dn-tx mt-2">You can't delete your own account.</p>
            )}
            <p className="text-xs text-t3 mt-2">This action cannot be undone.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUser(null)} disabled={deleting}>Cancel</Button>
            <Button
              variant="danger"
              loading={deleting}
              disabled={deleting || deleteUser?.id === me?.id}
              onClick={async () => {
                if (!deleteUser) return
                setDeleting(true)
                try {
                  const res = await fetch(`/api/users/${deleteUser.id}`, { method: "DELETE" })
                  const body = await res.json() as { error?: string }
                  if (!res.ok) { toast(body.error ?? "Failed to delete user", "error"); return }
                  toast(`${deleteUser.name} deleted`, "success")
                  setDeleteUser(null); load()
                } catch { toast("Network error", "error") }
                finally { setDeleting(false) }
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Temporary password display */}
      <Dialog open={!!tempPasswordInfo} onOpenChange={o => { if (!o) setTempPasswordInfo(null) }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Temporary password</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-t2 mb-3">
              Give this password to <span className="font-semibold text-t1">{tempPasswordInfo?.name}</span> so they can log in. They'll be asked to set their own password on first login.
            </p>
            <div className="bg-pg border border-bd rounded-md p-3 flex items-center justify-between gap-2">
              <div>
                <p className="type-helper text-t4 mb-0.5">Email</p>
                <p className="text-sm font-medium text-t1">{tempPasswordInfo?.email}</p>
              </div>
              <div>
                <p className="type-helper text-t4 mb-0.5">Temporary password</p>
                <p className="text-sm font-mono font-semibold text-ac">{tempPasswordInfo?.password}</p>
              </div>
              <button
                onClick={() => {
                  if (tempPasswordInfo) {
                    navigator.clipboard.writeText(tempPasswordInfo.password)
                    toast("Password copied", "success")
                  }
                }}
                className="shrink-0 text-t4 hover:text-t2"
                title="Copy password"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-wn-tx mt-3 flex items-start gap-1.5">
              <KeyRound className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              This password is shown once. If it's lost, use the key icon to reset it.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="primary" onClick={() => setTempPasswordInfo(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}

export default function UsersPage() {
  return <RequireRole roles={["ADMIN"]}><UsersPageInner /></RequireRole>
}
