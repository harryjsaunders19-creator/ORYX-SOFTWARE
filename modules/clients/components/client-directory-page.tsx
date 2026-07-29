"use client"
import { Suspense, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { Plus, Building2, Upload } from "lucide-react"
import { useUser } from "@/shared/providers/user-context"
import { Button }   from "@/shared/ui/button"
import { useToast } from "@/shared/ui/toast"
import { cn }       from "@/shared/utils/utils"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import { useClientMediaQuery } from "@/shared/hooks/use-media-query"
import { useApi, optimisticListRemove, optimisticListPrepend } from "@/shared/hooks/use-api"
import { PageHeader, PageShell, SearchField, DataPanel, EmptyPanel, TablePagination } from "@/shared/layouts/page-layout"
import type { Client } from "@/lib/types"
import type { ClientContactInput, ClientContactRow } from "../types/client-contact-types"
import { contactsFromClient } from "../types/client-contact-types"
import { CLIENT_LIMIT, type ClientWithMeta, type ClientsData } from "./client-directory-types"
import { ClientTableRow } from "./client-table-row"
import { ClientMobileCard } from "./client-mobile-card"
import { CreateClientDialog, EditClientDialog, ArchiveClientDialog } from "./client-directory-dialogs"

function ClientsInner() {
  const { toast } = useToast()
  const { isAdmin } = useUser()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [search,     setSearch]     = useState(() => searchParams.get("search") ?? "")
  const debouncedSearch = useDebouncedValue(search, 280)
  const [showAll,    setShowAll]    = useState(false)
  const [page,       setPage]       = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [editContacts, setEditContacts] = useState<ClientContactInput[] | null>(null)
  const [editContactsLoading, setEditContactsLoading] = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [dupError,   setDupError]   = useState<{ msg: string; existing: Client } | null>(null)
  const [archiveClient, setArchiveClient] = useState<ClientWithMeta | null>(null)
  const [archiving,     setArchiving]     = useState(false)

  useEffect(() => {
    if (searchParams.get("new") !== "1") return
    setCreateOpen(true)
    const next = new URLSearchParams(searchParams.toString())
    next.delete("new")
    const qs = next.toString()
    router.replace(qs ? `/clients?${qs}` : "/clients", { scroll: false })
  }, [searchParams, router])

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
  const { matches: isMobile, ready: mediaReady } = useClientMediaQuery("(max-width: 767px)")

  const handleEditOpen = useCallback((c: ClientWithMeta) => {
    setEditClient(c)
    setDupError(null)
    setEditContacts(null)
    setEditContactsLoading(true)
    fetch(`/api/clients/${c.id}`)
      .then(r => r.json() as Promise<{ contacts?: ClientContactRow[] }>)
      .then(data => {
        setEditContacts(
          data.contacts?.length
            ? data.contacts.map(row => ({
                id: row.id,
                name: row.name,
                email: row.email,
                phone: row.phone,
                role: row.role,
              }))
            : contactsFromClient(c),
        )
      })
      .catch(() => setEditContacts(contactsFromClient(c)))
      .finally(() => setEditContactsLoading(false))
  }, [])
  const handleArchiveOpen = useCallback((c: ClientWithMeta) => setArchiveClient(c), [])

  const doCreate = async (d: Partial<Client> & { contacts: ClientContactInput[] }) => {
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

  const doEdit = async (d: Partial<Client> & { contacts: ClientContactInput[] }) => {
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

  const doRestore = useCallback(async (c: Client) => {
    const res = await fetch(`/api/clients/${c.id}/restore`, { method: "POST" })
    if (!res.ok) { toast("Restore failed", "error"); return }
    toast(`${c.name} restored`, "success"); mutate()
  }, [mutate, toast])

  const doArchive = async () => {
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
  }

  return (
    <PageShell wide>
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

      <div className="flex items-center gap-3 mb-4 max-md:flex-col max-md:items-stretch">
        <SearchField value={search} onChange={setSearch} placeholder="Search clients…" />
        <label className="flex items-center gap-2 text-xs text-t3 cursor-pointer select-none shrink-0 max-md:min-h-11">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="h-4 w-4 accent-ac" />
          Show archived
        </label>
      </div>

      {loading || !mediaReady ? (
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
      ) : isMobile ? (
        <div className={cn("space-y-2.5 transition-opacity", refreshing && "opacity-60")}>
          {data.clients.map(c => (
            <ClientMobileCard
              key={c.id}
              client={c}
              isAdmin={isAdmin}
              onEdit={handleEditOpen}
              onRestore={doRestore}
              onArchive={handleArchiveOpen}
            />
          ))}
        </div>
      ) : (
        <DataPanel className={cn("overflow-x-auto overscroll-x-contain -mx-0 transition-opacity", refreshing && "opacity-60")}>
          <table className={cn("w-full min-w-[640px] text-sm")}>
            <thead>
              <tr className="bg-surface-low border-b border-bd text-xs">
                <th className="px-4 py-2.5 text-left ">Company</th>
                <th className="px-4 py-2.5 text-left ">Contact</th>
                <th className="px-4 py-2.5 text-left ">Email</th>
                <th className="px-4 py-2.5 text-left ">Phone</th>
                {isAdmin && <th className="px-4 py-2.5 text-right ">Active jobs</th>}
                <th className="px-4 py-2.5 text-left ">Added</th>
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

      <TablePagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        total={data?.total}
        pageSize={CLIENT_LIMIT}
      />

      <CreateClientDialog
        open={createOpen}
        onOpenChange={o => { if (!o) setCreateOpen(false) }}
        dupError={dupError}
        saving={saving}
        onSubmit={doCreate}
      />

      <EditClientDialog
        editClient={editClient}
        editContacts={editContacts}
        editContactsLoading={editContactsLoading}
        dupError={dupError}
        saving={saving}
        onClose={() => setEditClient(null)}
        onSubmit={doEdit}
      />

      <ArchiveClientDialog
        archiveClient={archiveClient}
        archiving={archiving}
        onOpenChange={o => { if (!o && !archiving) setArchiveClient(null) }}
        onConfirm={doArchive}
      />
    </PageShell>
  )
}

export default function ClientsPage() {
  return (
    <Suspense
      fallback={
        <PageShell wide>
          <div className="skeleton h-9 w-36 rounded mb-2" />
          <div className="skeleton h-4 w-48 rounded mb-8" />
          <DataPanel>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 border-b border-bd last:border-0 px-4 flex items-center">
                <div className="skeleton h-4 w-48 rounded" />
              </div>
            ))}
          </DataPanel>
        </PageShell>
      }
    >
      <ClientsInner />
    </Suspense>
  )
}
