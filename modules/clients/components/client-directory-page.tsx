"use client"
import { Suspense, memo, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { format } from "date-fns"
import { Plus, RotateCcw, Building2, ChevronRight, Archive, Upload, ChevronLeft } from "lucide-react"
import { useUser } from "@/shared/providers/user-context"
import { Button }   from "@/shared/ui/button"
import { Input }    from "@/shared/ui/input"
import { Label }    from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogBody,
} from "@/shared/ui/dialog"
import { useToast } from "@/shared/ui/toast"
import { cn }       from "@/shared/utils/utils"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import { useApi, optimisticListRemove, optimisticListPrepend } from "@/shared/hooks/use-api"
import { PageHeader, PageShell, SearchField, DataPanel, EmptyPanel } from "@/shared/layouts/page-layout"
import type { Client } from "@/lib/types"

const CLIENT_LIMIT = 50

type ClientWithMeta = Client & { activeJobCount: number; onHold: boolean }
type ClientsData = { clients: ClientWithMeta[]; total: number; page?: number; limit?: number }

const ClientTableRow = memo(function ClientTableRow({
  client: c,
  isAdmin,
  onEdit,
  onRestore,
  onArchive,
}: {
  client: ClientWithMeta
  isAdmin: boolean
  onEdit: (c: ClientWithMeta) => void
  onRestore: (c: Client) => void
  onArchive: (c: ClientWithMeta) => void
}) {
  return (
    <tr className={cn("border-b border-bd last:border-0 hover:bg-pg", !c.active && "opacity-60")}>
      <td className="px-4 py-3">
        <Link href={`/clients/${c.id}`} prefetch={false} className="font-medium text-t1 hover:text-ac flex items-center gap-1.5">
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
            <Button variant="ghost" size="sm" onClick={() => onEdit(c)}>Edit</Button>
            {!c.active ? (
              <Button variant="ghost" size="icon-sm" onClick={() => onRestore(c)} title="Restore" className="text-t4 hover:text-ac"><RotateCcw className="h-3.5 w-3.5" /></Button>
            ) : (
              <Button variant="ghost" size="icon-sm" onClick={() => onArchive(c)} title="Archive client" className="text-t4 hover:text-wn-tx hover:bg-wn-bg">
                <Archive className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </td>
      )}
    </tr>
  )
})

function ClientForm({ formId, initial, onSubmit, saving: _saving }: {
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
  const searchParams = useSearchParams()
  const [search,     setSearch]     = useState(() => searchParams.get("search") ?? "")
  const debouncedSearch = useDebouncedValue(search, 280)
  const [showAll,    setShowAll]    = useState(false)
  const [page,       setPage]       = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [dupError,   setDupError]   = useState<{ msg: string; existing: Client } | null>(null)
  const [archiveClient, setArchiveClient] = useState<ClientWithMeta | null>(null)
  const [archiving,     setArchiving]     = useState(false)

  useEffect(() => { setPage(1) }, [debouncedSearch, showAll])

  const apiKey = `/api/clients?${new URLSearchParams({
    search: debouncedSearch,
    active: showAll ? "false" : "true",
    page: String(page),
    limit: String(CLIENT_LIMIT),
  })}`
  const { data, error, isLoading, isValidating, mutate } = useApi<ClientsData>(apiKey)

  useEffect(() => { if (error) toast("Failed to load", "error") }, [error, toast])

  const loading = isLoading && !data
  const refreshing = isValidating && !!data
  const totalPages = data ? Math.max(1, Math.ceil(data.total / CLIENT_LIMIT)) : 1

  const handleEditOpen = useCallback((c: ClientWithMeta) => { setEditClient(c); setDupError(null) }, [])
  const handleArchiveOpen = useCallback((c: ClientWithMeta) => setArchiveClient(c), [])

  const doCreate = async (d: Partial<Client>) => {
    setSaving(true); setDupError(null)
    try {
      const res  = await fetch("/api/clients", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(d) })
      const body = await res.json() as Client & { error?: string; existing?: Client }
      if (res.status === 409) { setDupError({ msg: body.error ?? "Duplicate", existing: body.existing! }); return }
      if (!res.ok) { toast(body.error ?? "Failed", "error"); return }
      toast(`${(body as Client).name} created`, "success")
      setCreateOpen(false)
      optimisticListPrepend(mutate, "clients", { ...(body as Client), activeJobCount: 0, onHold: false })
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
      toast("Saved", "success"); setEditClient(null); mutate()
    } catch { toast("Network error", "error") }
    finally { setSaving(false) }
  }

  const doRestore = async (c: Client) => {
    const res = await fetch(`/api/clients/${c.id}/restore`, { method: "POST" })
    if (!res.ok) { toast("Restore failed", "error"); return }
    toast(`${c.name} restored`, "success"); mutate()
  }

  return (
    <PageShell>
      <PageHeader
        title="Clients"
        description={`${data?.total ?? 0} client${data?.total !== 1 ? "s" : ""}${!showAll ? " (active)" : ""}`}
        actions={
          <>
            <Button variant="primary" size="sm" onClick={() => { setCreateOpen(true); setDupError(null) }}>
              <Plus className="h-3.5 w-3.5" /> New client
            </Button>
            {isAdmin && (
              <Link href="/clients/import">
                <Button variant="outline" size="sm">
                  <Upload className="h-3.5 w-3.5" /> Import
                </Button>
              </Link>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center">
        <SearchField value={search} onChange={setSearch} placeholder="Search clients…" />
        <label className="flex min-h-[44px] items-center gap-2 text-xs text-t3 cursor-pointer select-none shrink-0">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="h-4 w-4 accent-ac" />
          Show archived
        </label>
      </div>

      {loading ? (
        <DataPanel>
          {[...Array(5)].map((_, i) => <div key={i} className="h-14 border-b border-bd last:border-0 px-4 flex items-center"><div className="skeleton h-4 w-48 rounded" /></div>)}
        </DataPanel>
      ) : !data?.clients.length ? (
        <DataPanel>
          <EmptyPanel
            icon={Building2}
            title="No clients yet"
            description="Create your first client or they will be auto-imported from jobs."
            action={<Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> New client</Button>}
          />
        </DataPanel>
      ) : (
        <DataPanel className={cn("overflow-x-auto overscroll-x-contain -mx-0 transition-opacity", refreshing && "opacity-60")}>
          <table className={cn("w-full min-w-[640px] text-sm")}>
            <thead>
              <tr className="bg-surface-low border-b border-bd text-xs">
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
                <ClientTableRow
                  key={c.id}
                  client={c}
                  isAdmin={isAdmin}
                  onEdit={handleEditOpen}
                  onRestore={doRestore}
                  onArchive={handleArchiveOpen}
                />
              ))}
            </tbody>
          </table>
        </DataPanel>
      )}

      {data && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 mt-3 border border-bd rounded-xl bg-sr shadow-card">
          <p className="text-xs text-t3">
            {((page - 1) * CLIENT_LIMIT) + 1}–{Math.min(page * CLIENT_LIMIT, data.total)} of{" "}
            <span className="font-semibold text-t2">{data.total.toLocaleString()}</span>
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-t3 tabular-nums px-2">{page} / {totalPages}</span>
            <Button variant="outline" size="icon-sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
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

      {/* Archive confirmation */}
      <Dialog open={!!archiveClient} onOpenChange={o => { if (!o && !archiving) setArchiveClient(null) }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Archive client?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-t2">
              <span className="font-semibold text-t1">{archiveClient?.name}</span>
              {" "}will be moved to the archive and hidden from the active client list.
            </p>
            {archiveClient && archiveClient.activeJobCount > 0 && (
              <div className="mt-3 p-3 bg-wn-bg border border-wn-bd rounded-md text-xs text-wn-tx">
                This client has {archiveClient.activeJobCount} active job{archiveClient.activeJobCount !== 1 ? "s" : ""}.
                Job references will be preserved.
              </div>
            )}
            <p className="text-xs text-t3 mt-2">
              You can restore the client from the{" "}
              <span className="font-medium text-t2">Archived Items</span>{" "}page.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveClient(null)} disabled={archiving}>Cancel</Button>
            <Button variant="primary" loading={archiving} disabled={archiving} className="bg-wn hover:bg-wn/90" onClick={async () => {
              if (!archiveClient) return
              setArchiving(true)
              try {
                const res = await fetch(`/api/clients/${archiveClient.id}`, { method: "DELETE" })
                const body = await res.json() as { archived?: boolean; deleted?: boolean; error?: string; detail?: string }
                if (!res.ok) { toast(body.detail ?? body.error ?? "Failed to archive client", "error"); return }
                toast(`${archiveClient.name} archived`, "success")
                setArchiveClient(null)
                optimisticListRemove(mutate, "clients", archiveClient.id)
              } catch { toast("Network error", "error") }
              finally { setArchiving(false) }
            }}>
              <Archive className="h-3.5 w-3.5" /> Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}

export default function ClientsPage() {
  return <Suspense><ClientsInner /></Suspense>
}
