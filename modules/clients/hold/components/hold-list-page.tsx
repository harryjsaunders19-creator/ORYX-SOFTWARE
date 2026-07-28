"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import {
  ArrowLeft, ShieldCheck,
  Building2, Plus,
} from "lucide-react"
import { Button }   from "@/shared/ui/button"
import { Input }    from "@/shared/ui/input"
import { Label }    from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogBody,
} from "@/shared/ui/dialog"
import { useToast } from "@/shared/ui/toast"
import { formatGBP } from "@/shared/utils/utils"
// Perf: SWR caches hold list; mutate() refreshes after add/remove/edit.
import { useApi } from "@/shared/hooks/use-api"
import { PageHeader, PageShell, DataPanel, EmptyPanel } from "@/shared/layouts/page-layout"
import { ListSkeleton } from "@/shared/ui/list-skeleton"
import type { ClientHoldWithClient } from "@/lib/types"

type HoldListData = { holds: ClientHoldWithClient[]; total: number }


export default function HoldListPage() {
  const { toast }    = useToast()

  const { data, isLoading: loading, mutate: load } = useApi<HoldListData>("/api/hold-list")
  const [addOpen,     setAddOpen]     = useState(false)
  const [removeItem,  setRemoveItem]  = useState<ClientHoldWithClient | null>(null)
  const [editItem,    setEditItem]    = useState<ClientHoldWithClient | null>(null)
  const [saving,      setSaving]      = useState(false)

  // Add hold form state
  const [clientSearch, setClientSearch] = useState("")
  const [clientResults, setClientResults] = useState<{ id: string; name: string }[]>([])
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null)
  const [reason,      setReason]      = useState("")
  const [notes,       setNotes]       = useState("")
  const [removeReason, setRemoveReason] = useState("")
  const [editReason,  setEditReason]  = useState("")
  const [editNotes,   setEditNotes]   = useState("")

  // Live client search for the add-hold form
  useEffect(() => {
    if (!clientSearch.trim()) { setClientResults([]); return }
    const ac = new AbortController()
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/clients/search?q=${encodeURIComponent(clientSearch)}&limit=6`,
          { signal: ac.signal },
        )
        if (r.ok) {
          const d = await r.json() as { clients: { id: string; name: string }[] }
          setClientResults(d.clients)
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
      }
    }, 150)
    return () => { clearTimeout(t); ac.abort() }
  }, [clientSearch])

  const doAdd = async () => {
    if (!selectedClient || !reason.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/clients/${selectedClient.id}/hold`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim(), notes: notes.trim() || null }),
      })
      if (!res.ok) { toast("Failed to add hold", "error"); return }
      toast(`${selectedClient.name} placed on hold`, "info")
      setAddOpen(false); setSelectedClient(null); setClientSearch(""); setReason(""); setNotes("")
      void load()
    } catch { toast("Network error", "error") }
    finally { setSaving(false) }
  }

  const doRemove = async () => {
    if (!removeItem) return
    setSaving(true)
    const removed = removeItem
    try {
      const res = await fetch(`/api/clients/${removed.clientId}/hold`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removedReason: removeReason.trim() || null }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string; detail?: string }
        toast(err.detail ?? err.error ?? "Failed to remove hold", "error")
        return
      }
      // Perf: optimistic local mutate via SWR (same filter as before)
      await load(
        (prev) => prev
          ? { holds: prev.holds.filter(h => h.clientId !== removed.clientId), total: prev.total - 1 }
          : prev,
        { revalidate: false },
      )
      toast(`${removed.clientName} removed from hold`, "success")
      setRemoveItem(null); setRemoveReason("")
    } catch { toast("Network error", "error") }
    finally { setSaving(false) }
  }

  const doEdit = async () => {
    if (!editItem || !editReason.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/clients/${editItem.clientId}/hold`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: editReason.trim(), notes: editNotes.trim() || null }),
      })
      if (!res.ok) { toast("Failed to update hold", "error"); return }
      toast("Hold updated", "success")
      setEditItem(null); void load()
    } catch { toast("Network error", "error") }
    finally { setSaving(false) }
  }

  return (
    <PageShell>
      <Link href="/clients" className="inline-flex items-center gap-1.5 text-xs text-t3 hover:text-t2 mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> All clients
      </Link>

      <PageHeader
        title="Hold List"
        description={`${data?.total ?? 0} client${data?.total !== 1 ? "s" : ""} currently on hold`}
        actions={
          <Button variant="danger" size="sm" onClick={() => {
            setAddOpen(true); setSelectedClient(null); setClientSearch(""); setReason(""); setNotes("")
          }}>
            <Plus className="h-3.5 w-3.5" /> Add to hold list
          </Button>
        }
      />

      {loading ? (
        <ListSkeleton rows={4} />
      ) : !data?.holds.length ? (
        <DataPanel>
          <EmptyPanel
            icon={ShieldCheck}
            title="No clients on hold"
            description="The hold list is empty. Clients can be added here or from their client page."
          />
        </DataPanel>
      ) : (
        <DataPanel>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-pg border-b border-bd text-xs">
                <th className="px-4 py-2.5 text-left font-semibold text-t3">Client</th>
                <th className="px-4 py-2.5 text-left font-semibold text-t3">Reason</th>
                <th className="px-4 py-2.5 text-left font-semibold text-t3">Date Added</th>
                <th className="px-4 py-2.5 text-right font-semibold text-t3">Active Jobs</th>
                <th className="px-4 py-2.5 text-right font-semibold text-t3">Quote Value</th>
                <th className="px-4 py-2.5 w-32" />
              </tr>
            </thead>
            <tbody>
              {data.holds.map(hold => (
                <tr key={hold.id} className="border-b border-bd last:border-0 hover:bg-pg">
                  <td className="px-4 py-3">
                    <Link href={`/clients/${hold.clientId}`} className="flex items-center gap-2 font-medium text-t1 hover:text-ac">
                      <Building2 className="h-3.5 w-3.5 text-t4 shrink-0" />
                      {hold.clientName}
                    </Link>
                    {hold.notes && (
                      <p className="text-xs text-t4 mt-0.5 ml-5 italic">{hold.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-dn-tx font-medium">{hold.reason}</p>
                    <p className="text-[11px] text-t4 mt-0.5">by {hold.addedBy}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-t3 whitespace-nowrap tabular-nums">
                    {format(new Date(hold.addedAt), "d MMM yyyy")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-semibold tabular-nums ${hold.activeJobCount > 0 ? "text-wn-tx" : "text-t4"}`}>
                      {hold.activeJobCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold tabular-nums text-t1">
                      {hold.quoteValueTotal && hold.quoteValueTotal > 0 ? formatGBP(hold.quoteValueTotal) : <span className="text-t4">—</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => {
                        setEditItem(hold); setEditReason(hold.reason); setEditNotes(hold.notes ?? "")
                      }}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm"
                        className="text-ok-tx hover:bg-ok-bg"
                        onClick={() => { setRemoveItem(hold); setRemoveReason("") }}>
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataPanel>
      )}

      {/* Add hold dialog */}
      <Dialog open={addOpen} onOpenChange={o => { if (!o) setAddOpen(false) }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Add client to hold list</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <Label>Client *</Label>
              {selectedClient ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-pg border border-bd rounded-md">
                  <Building2 className="h-3.5 w-3.5 text-t4" />
                  <span className="text-sm font-medium text-t1 flex-1">{selectedClient.name}</span>
                  <button type="button" onClick={() => { setSelectedClient(null); setClientSearch("") }}
                    className="text-t4 hover:text-t2 text-xs">Change</button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                    placeholder="Search clients…" autoFocus
                  />
                  {clientResults.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full bg-sr border border-bd rounded-xl shadow-card overflow-hidden"
                      style={{ position: "absolute", zIndex: 50, background: "var(--color-sr)", border: "1px solid var(--color-bd)" }}>
                      {clientResults.map(c => (
                        <button key={c.id} type="button"
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-pg"
                          onClick={() => { setSelectedClient(c); setClientSearch("") }}>
                          <Building2 className="h-3.5 w-3.5 text-t4" />
                          <span className="font-medium text-t1">{c.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Reason *</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)}
                placeholder="e.g. Outstanding debt, dispute in progress" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Notes (optional)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)}
                rows={2} placeholder="Additional context…" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="danger" onClick={doAdd} loading={saving}
              disabled={!selectedClient || !reason.trim() || saving}>
              Place on hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit hold dialog */}
      <Dialog open={!!editItem} onOpenChange={o => { if (!o) setEditItem(null) }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Edit hold — {editItem?.clientName}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <Label>Reason *</Label>
              <Input value={editReason} onChange={e => setEditReason(e.target.value)} autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Notes (optional)</Label>
              <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={doEdit} loading={saving}
              disabled={!editReason.trim() || saving}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove hold dialog */}
      <Dialog open={!!removeItem} onOpenChange={o => { if (!o) setRemoveItem(null) }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Remove from hold</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-sm text-t2">
              Remove <strong>{removeItem?.clientName}</strong> from the hold list?
              The hold record will be retained for audit purposes.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label>Reason for removal (optional)</Label>
              <Input value={removeReason} onChange={e => setRemoveReason(e.target.value)}
                autoFocus placeholder="e.g. Debt settled, issue resolved" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveItem(null)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={doRemove} loading={saving}>
              Remove from hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
