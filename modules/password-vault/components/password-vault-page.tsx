"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import {
  Plus, Pencil, Trash2, Copy, Eye, EyeOff, ExternalLink,
  ArrowUpDown, KeyRound,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogBody,
} from "@/shared/ui/dialog"
import { useToast } from "@/shared/ui/toast"
import {
  PageHeader, PageShell, SearchField, DataPanel, EmptyPanel,
  TableShell, TableHead, Th,
} from "@/shared/layouts/page-layout"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import { RequireRole } from "@/components/require-role"
import type { PasswordVaultEntry } from "../types"

type VaultData = { entries: PasswordVaultEntry[]; total: number }
type SortOrder = "asc" | "desc"

type FormState = {
  serviceName: string
  loginUrl: string
  username: string
  password: string
  category: string
  notes: string
}

const EMPTY_FORM: FormState = {
  serviceName: "",
  loginUrl: "",
  username: "",
  password: "",
  category: "",
  notes: "",
}

async function copyText(text: string, label: string, toast: (msg: string, type?: "success" | "error") => void) {
  try {
    await navigator.clipboard.writeText(text)
    toast(`${label} copied`, "success")
  } catch {
    toast(`Failed to copy ${label.toLowerCase()}`, "error")
  }
}

function VaultForm({ formId, initial, onSubmit, isEdit }: {
  formId: string
  initial: FormState
  onSubmit: (data: FormState) => void
  isEdit?: boolean
}) {
  const [form, setForm] = useState(initial)
  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }))

  return (
    <form
      id={formId}
      onSubmit={e => { e.preventDefault(); onSubmit(form) }}
      className="space-y-3"
    >
      <div className="flex flex-col gap-1.5">
        <Label>Service Name *</Label>
        <Input value={form.serviceName} onChange={set("serviceName")} required placeholder="Adobe Creative Cloud" autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Website / Login URL</Label>
        <Input value={form.loginUrl} onChange={set("loginUrl")} placeholder="https://account.adobe.com" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Username / Email</Label>
          <Input value={form.username} onChange={set("username")} placeholder="accounts@oryxdesign.co.uk" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Password{isEdit ? "" : " *"}</Label>
          <Input
            type="password"
            value={form.password}
            onChange={set("password")}
            required={!isEdit}
            placeholder={isEdit ? "Leave blank to keep current" : "••••••••"}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Category</Label>
        <Input value={form.category} onChange={set("category")} placeholder="Design, Marketing, Hosting…" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Notes</Label>
        <Textarea value={form.notes} onChange={set("notes")} rows={3} placeholder="Shared login details, seat count, renewal notes…" />
      </div>
    </form>
  )
}

function PasswordCell({ password, onCopy }: { password: string; onCopy: () => void }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="flex items-center gap-1.5 min-w-[140px]">
      <span className="font-mono text-xs text-t1 truncate max-w-[120px]">
        {visible ? password : "••••••••"}
      </span>
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        className="p-1 rounded text-t3 hover:text-t1 hover:bg-pg"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={onCopy}
        className="p-1 rounded text-t3 hover:text-t1 hover:bg-pg"
        aria-label="Copy password"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function entryToForm(entry: PasswordVaultEntry, forEdit = false): FormState {
  return {
    serviceName: entry.serviceName,
    loginUrl: entry.loginUrl ?? "",
    username: entry.username ?? "",
    password: forEdit ? "" : entry.password,
    category: entry.category ?? "",
    notes: entry.notes ?? "",
  }
}

function VaultPageInner() {
  const { toast } = useToast()
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortOrder>("asc")
  const [data, setData] = useState<VaultData | null>(null)
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<PasswordVaultEntry | null>(null)
  const [deleteEntry, setDeleteEntry] = useState<PasswordVaultEntry | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const debouncedSearch = useDebouncedValue(search, 280)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ search: debouncedSearch, sort })
      const res = await fetch(`/api/password-vault?${qs}`)
      if (!res.ok) throw new Error()
      setData(await res.json() as VaultData)
    } catch {
      toast("Failed to load password vault", "error")
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, sort, toast])

  useEffect(() => { load() }, [load])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const e of data?.entries ?? []) {
      if (e.category) set.add(e.category)
    }
    return [...set].sort()
  }, [data?.entries])

  const doCreate = async (form: FormState) => {
    setSaving(true)
    try {
      const res = await fetch("/api/password-vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceName: form.serviceName.trim(),
          loginUrl: form.loginUrl.trim() || null,
          username: form.username.trim() || null,
          password: form.password,
          category: form.category.trim() || null,
          notes: form.notes.trim() || null,
        }),
      })
      const body = await res.json() as { error?: string }
      if (!res.ok) { toast(body.error ?? "Failed to add account", "error"); return }
      setCreateOpen(false)
      toast("Account added", "success")
      load()
    } catch {
      toast("Network error", "error")
    } finally {
      setSaving(false)
    }
  }

  const doEdit = async (form: FormState) => {
    if (!editEntry) return
    setSaving(true)
    try {
      const payload: Record<string, string | null> = {
        serviceName: form.serviceName.trim(),
        loginUrl: form.loginUrl.trim() || null,
        username: form.username.trim() || null,
        category: form.category.trim() || null,
        notes: form.notes.trim() || null,
      }
      if (form.password) payload.password = form.password

      const res = await fetch(`/api/password-vault/${editEntry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await res.json() as { error?: string }
      if (!res.ok) { toast(body.error ?? "Failed to update account", "error"); return }
      setEditEntry(null)
      toast("Account updated", "success")
      load()
    } catch {
      toast("Network error", "error")
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async () => {
    if (!deleteEntry) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/password-vault/${deleteEntry.id}`, { method: "DELETE" })
      const body = await res.json() as { error?: string }
      if (!res.ok) { toast(body.error ?? "Failed to delete account", "error"); return }
      setDeleteEntry(null)
      toast("Account deleted", "success")
      load()
    } catch {
      toast("Network error", "error")
    } finally {
      setDeleting(false)
    }
  }

  const toggleSort = () => setSort(s => (s === "asc" ? "desc" : "asc"))

  return (
    <PageShell wide>
      <PageHeader
        title="Account Passwords"
        description="Shared business logins for company software and services — not personal credentials."
        actions={(
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add account
          </Button>
        )}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search by service name…"
          className="max-w-sm"
        />
        {categories.length > 0 && (
          <p className="text-xs text-t3">
            {categories.length} categor{categories.length === 1 ? "y" : "ies"} · {data?.total ?? 0} accounts
          </p>
        )}
      </div>

      <DataPanel noPadding>
        {loading && !data ? (
          <div className="p-8 text-center text-sm text-t3">Loading vault…</div>
        ) : !data?.entries.length ? (
          <EmptyPanel
            icon={KeyRound}
            title="No accounts yet"
            description="Add shared logins for Adobe, Canva, hosting, and other company services."
            action={(
              <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Add first account
              </Button>
            )}
          />
        ) : (
          <TableShell>
            <table className="w-full text-sm">
              <TableHead>
                <Th>
                  <button
                    type="button"
                    onClick={toggleSort}
                    className="inline-flex items-center gap-1 hover:text-t1"
                  >
                    Service
                    <ArrowUpDown className="h-3 w-3" />
                    <span className="sr-only">Sort {sort === "asc" ? "descending" : "ascending"}</span>
                  </button>
                </Th>
                <Th>Username</Th>
                <Th>Password</Th>
                <Th className="hidden lg:table-cell">Login URL</Th>
                <Th className="hidden md:table-cell">Category</Th>
                <Th className="hidden xl:table-cell">Notes</Th>
                <Th className="hidden lg:table-cell">Created</Th>
                <Th className="hidden sm:table-cell">Updated</Th>
                <Th align="right">Actions</Th>
              </TableHead>
              <tbody className="divide-y divide-bd">
                {data.entries.map(entry => (
                  <tr key={entry.id} className="hover:bg-pg/50">
                    <td className="px-4 py-3 font-medium text-t1 whitespace-nowrap">{entry.serviceName}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-t2 truncate max-w-[160px]">{entry.username || "—"}</span>
                        {entry.username && (
                          <button
                            type="button"
                            onClick={() => copyText(entry.username!, "Username", toast)}
                            className="shrink-0 p-1 rounded text-t3 hover:text-t1 hover:bg-pg"
                            aria-label="Copy username"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <PasswordCell
                        password={entry.password}
                        onCopy={() => copyText(entry.password, "Password", toast)}
                      />
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell max-w-[200px]">
                      {entry.loginUrl ? (
                        <a
                          href={entry.loginUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-ac hover:text-ach truncate max-w-full"
                        >
                          <span className="truncate">{entry.loginUrl.replace(/^https?:\/\//, "")}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-t4">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-t2 whitespace-nowrap">
                      {entry.category || "—"}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell text-t3 max-w-[200px] truncate">
                      {entry.notes || "—"}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-t3 whitespace-nowrap tabular-nums text-xs">
                      {format(new Date(entry.createdAt), "d MMM yyyy")}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-t3 whitespace-nowrap tabular-nums text-xs">
                      {format(new Date(entry.updatedAt), "d MMM yyyy")}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => setEditEntry(entry)} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setDeleteEntry(entry)} title="Delete" className="text-t4 hover:text-dn">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        )}
      </DataPanel>

      <Dialog open={createOpen} onOpenChange={o => { if (!o && !saving) setCreateOpen(false) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add company account</DialogTitle></DialogHeader>
          <DialogBody>
            <VaultForm formId="create-vault-form" initial={EMPTY_FORM} onSubmit={doCreate} />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="create-vault-form" variant="primary" loading={saving}>Add account</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editEntry} onOpenChange={o => { if (!o && !saving) setEditEntry(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit account</DialogTitle></DialogHeader>
          <DialogBody>
            {editEntry && (
              <VaultForm
                key={editEntry.id}
                formId="edit-vault-form"
                initial={entryToForm(editEntry, true)}
                onSubmit={doEdit}
                isEdit
              />
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="edit-vault-form" variant="primary" loading={saving}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteEntry} onOpenChange={o => { if (!o && !deleting) setDeleteEntry(null) }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Delete account</DialogTitle></DialogHeader>
          <DialogBody>
            <p className="text-sm text-t2">
              Permanently delete <span className="font-semibold text-t1">{deleteEntry?.serviceName}</span> from the vault?
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteEntry(null)} disabled={deleting}>Cancel</Button>
            <Button variant="danger" loading={deleting} onClick={doDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}

export default function PasswordVaultPage() {
  return (
    <RequireRole roles={["ADMIN"]}>
      <VaultPageInner />
    </RequireRole>
  )
}
