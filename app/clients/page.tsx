"use client"
import { Suspense, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { format } from "date-fns"
import { Plus, Search, RotateCcw, Building2, ChevronRight, Trash2 } from "lucide-react"
import { useUser } from "@/components/user-context"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import { Label }    from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogBody,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { cn }       from "@/lib/utils"
import type { Client } from "@/lib/types"

type ClientWithMeta = Client & { activeJobCount: number; onHold: boolean }
type ClientsData = { clients: ClientWithMeta[]; total: number }

function ClientForm({ formId, initial, onSubmit, saving }: {
  formId: string
  initial: Partial<Client>
  onSubmit: (data: Partial<Client>) => Promise<void>
  saving: boolean
}) {
  const [name,    setName]    = useState(initial.name            ?? "")
  const [contact, setContact] = useState(initial.contactName     ?? "")
  const [email,   setEmail]   = useState(initial.email           ?? "")
  const [phone,   setPhone]   = useState(initial.phone           ?? "")
  const [addr,    setAddr]    = useState(initial.billingAddress   ?? "")
  const [notes,   setNotes]   = useState(initial.notes           ?? "")
  const [accountCode, setAccountCode] = useState(initial.accountCode ?? "")

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      name: name.trim(), contactName: contact.trim() || null, email: email.trim() || null,
      phone: phone.trim() || null, billingAddress: addr.trim() || null, notes: notes.trim() || null,
      accountCode: accountCode.trim() || null,
    })
  }

  return (
    <form id={formId} onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Company name *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} autoFocus required placeholder="Acme Scaffolding Ltd" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Customer ID</Label>
          <Input value={accountCode} onChange={e => setAccountCode(e.target.value)} placeholder="e.g. ACME01" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Main contact</Label>
          <Input value={contact} onChange={e => setContact(e.target.value)} placeholder="Jane Smith" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Phone</Label>
          <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="01179 000000" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Email</Label>
        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="accounts@example.co.uk" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Billing address</Label>
        <Textarea value={addr} onChange={e => setAddr(e.target.value)} rows={2} placeholder="14 Industrial Way, Bristol" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Notes</Label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Terms, preferences…" />
      </div>
    </form>
  )
}

function ClientsInner() {
  const { toast } = useToast()
  const { isAdmin } = useUser()
  const [data,       setData]       = useState<ClientsData | null>(null)
  const [search,     setSearch]     = useState("")
  const [showAll,    setShowAll]    = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [dupError,   setDupError]   = useState<{ msg: string; existing: Client } | null>(null)
  const [deleteClient, setDeleteClient] = useState<ClientWithMeta | null>(null)
  const [deleting,     setDeleting]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ search, active: showAll ? "false" : "true", limit: "200" })
      setData(await fetch(`/api/clients?${qs}`).then(r => r.json()) as ClientsData)
    } catch { toast("Failed to load", "error") }
    finally  { setLoading(false) }
  }, [search, showAll, toast])

  useEffect(() => { load() }, [load])

  const doCreate = async (d: Partial<Client>) => {
    setSaving(true); setDupError(null)
    try {
      const res  = await fetch("/api/clients", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(d) })
      const body = await res.json() as Client & { error?: string; existing?: Client }
      if (res.status === 409) { setDupError({ msg: body.error ?? "Duplicate", existing: body.existing! }); return }
      if (!res.ok) { toast(body.error ?? "Failed", "error"); return }
      toast(`${(body as Client).name} created`, "success")
      setCreateOpen(false); load()
    } catch { toast("Network error", "error") }
    finally { setSaving(false) }
  }

  const doEdit = async (d: Partial<Client>) => {
    if (!editClient) return
    setSaving(true); setDupError(null)
    try {
      const res  = await fetch(`/api/clients/${editClient.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify(d) })
      const body = await res.json() as Client & { error?: string; existing?: Client }
      if (res.status === 409) { setDupError({ msg: body.error ?? "Duplicate", existing: body.existing! }); return }
      if (!res.ok) { toast(body.error ?? "Failed", "error"); return }
      toast("Saved", "success"); setEditClient(null); load()
    } catch { toast("Network error", "error") }
    finally { setSaving(false) }
  }

  const doRestore = async (c: Client) => {
    await fetch(`/api/clients/${c.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ active: true }) })
    toast(`${c.name} restored`, "success"); load()
  }

  return (
    <div className="px-6 py-6 max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-t1">Clients</h1>
          <p className="text-sm text-t3 mt-0.5">{data?.total ?? 0} client{data?.total !== 1 ? "s" : ""}{!showAll && " (active)"}</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => { setCreateOpen(true); setDupError(null) }}>
          <Plus className="h-3.5 w-3.5" /> New client
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-t4 pointer-events-none" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…"
            className="pl-8" style={{ paddingLeft: "32px" }} />
        </div>
        <label className="flex items-center gap-2 text-xs text-t3 cursor-pointer select-none">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="h-4 w-4 accent-ac" />
          Show archived
        </label>
      </div>

      {loading ? (
        <div className="bg-sr border border-bd rounded-md">
          {[...Array(5)].map((_, i) => <div key={i} className="h-14 border-b border-bd last:border-0 px-4 flex items-center"><div className="skeleton h-4 w-48 rounded" /></div>)}
        </div>
      ) : !data?.clients.length ? (
        <div className="bg-sr border border-bd rounded-md p-10 text-center">
          <Building2 className="h-8 w-8 text-t4 mx-auto mb-3" />
          <p className="text-sm font-medium text-t1 mb-1">No clients yet</p>
          <p className="text-xs text-t3 mb-4">Create your first client or they will be auto-imported from jobs.</p>
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> New client</Button>
        </div>
      ) : (
        <div className="bg-sr border border-bd rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-pg border-b border-bd text-xs">
                <th className="px-4 py-2.5 text-left font-semibold text-t3 uppercase tracking-wider">Company</th>
                <th className="px-4 py-2.5 text-left font-semibold text-t3 uppercase tracking-wider">Contact</th>
                <th className="px-4 py-2.5 text-left font-semibold text-t3 uppercase tracking-wider">Email</th>
                <th className="px-4 py-2.5 text-left font-semibold text-t3 uppercase tracking-wider">Phone</th>
                {isAdmin && <th className="px-4 py-2.5 text-right font-semibold text-t3 uppercase tracking-wider">Active jobs</th>}
                <th className="px-4 py-2.5 text-left font-semibold text-t3 uppercase tracking-wider">Added</th>
                {isAdmin && <th className="px-4 py-2.5 w-28" />}
              </tr>
            </thead>
            <tbody>
              {data.clients.map(c => (
                <tr key={c.id} className={cn("border-b border-bd last:border-0 hover:bg-pg", !c.active && "opacity-60")}>
                  <td className="px-4 py-3">
                    <Link href={`/clients/${c.id}`} className="font-medium text-t1 hover:text-ac flex items-center gap-1.5">
                      {c.name}
                      {!c.active && <span className="text-[10px] bg-t1/[0.06] text-t3 rounded-full px-2 font-medium">Archived</span>}
                      {c.onHold && <span className="text-[10px] bg-dn-bg text-dn rounded-full px-2 font-medium whitespace-nowrap">On Hold</span>}
                      <ChevronRight className="h-3 w-3 text-t4" />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-t3">{c.contactName ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-t3">{c.email ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-t3">{c.phone ?? "—"}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <span className={cn("text-xs font-semibold tabular-nums", c.activeJobCount > 0 ? "text-t2" : "text-t4")}>
                        {c.activeJobCount}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-xs text-t4 tabular-nums whitespace-nowrap">{format(new Date(c.createdAt), "d MMM yyyy")}</td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => { setEditClient(c); setDupError(null) }}>Edit</Button>
                        {!c.active && (
                          <Button variant="ghost" size="icon-sm" onClick={() => doRestore(c)} title="Restore" className="text-t4 hover:text-ac"><RotateCcw className="h-3.5 w-3.5" /></Button>
                        )}
                        <Button variant="ghost" size="icon-sm" onClick={() => setDeleteClient(c)} title="Delete" className="text-t4 hover:text-dn"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={o => { if (!o) setCreateOpen(false) }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>New client</DialogTitle></DialogHeader>
          <DialogBody>
            {dupError && (
              <div className="mb-3 p-3 bg-dn-bg border border-dn-bd rounded text-xs text-dn-tx">
                <p className="font-semibold mb-1">{dupError.msg}</p>
                <Link href={`/clients/${dupError.existing.id}`} className="text-ac hover:underline font-medium">
                  View existing client →
                </Link>
              </div>
            )}
            <ClientForm formId="create-client-form" initial={{}} onSubmit={doCreate} saving={saving} />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="create-client-form" variant="primary" loading={saving}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editClient} onOpenChange={o => { if (!o) setEditClient(null) }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Edit client</DialogTitle></DialogHeader>
          <DialogBody>
            {dupError && (
              <div className="mb-3 p-3 bg-dn-bg border border-dn-bd rounded text-xs text-dn-tx">
                <p className="font-semibold mb-1">{dupError.msg}</p>
                <Link href={`/clients/${dupError.existing.id}`} className="text-ac hover:underline font-medium">
                  View existing client →
                </Link>
              </div>
            )}
            {editClient && <ClientForm formId="edit-client-form" initial={editClient} onSubmit={doEdit} saving={saving} />}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditClient(null)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="edit-client-form" variant="primary" loading={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteClient} onOpenChange={o => { if (!o && !deleting) setDeleteClient(null) }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete client</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-t2 mb-3">
              Are you sure you want to delete <span className="font-semibold text-t1">{deleteClient?.name}</span>?
            </p>
            {deleteClient && deleteClient.activeJobCount > 0 && (
              <div className="p-3 bg-wn-bg border border-wn-bd rounded-md text-xs text-wn-tx mb-3"
                style={{ backgroundColor: "var(--color-wn-bg)", border: "1px solid var(--color-wn-bd)", borderRadius: "8px", padding: "12px" }}>
                This client has {deleteClient.activeJobCount} active job{deleteClient.activeJobCount !== 1 ? "s" : ""}. The client will be archived rather than permanently deleted so job references are preserved.
              </div>
            )}
            <p className="text-xs text-t3">
              {deleteClient && deleteClient.activeJobCount > 0
                ? "The client will be marked as archived and hidden from the active list."
                : "This action is permanent and cannot be undone."}
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteClient(null)} disabled={deleting}>Cancel</Button>
            <Button variant="danger" loading={deleting} disabled={deleting} onClick={async () => {
              if (!deleteClient) return
              setDeleting(true)
              try {
                const res = await fetch(`/api/clients/${deleteClient.id}`, { method: "DELETE" })
                const body = await res.json() as { archived?: boolean; deleted?: boolean; error?: string }
                if (!res.ok) { toast(body.error ?? "Failed to delete client", "error"); return }
                toast(body.archived ? `${deleteClient.name} archived` : `${deleteClient.name} deleted`, "success")
                setDeleteClient(null); load()
              } catch { toast("Network error", "error") }
              finally { setDeleting(false) }
            }}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function ClientsPage() {
  return <Suspense><ClientsInner /></Suspense>
}
