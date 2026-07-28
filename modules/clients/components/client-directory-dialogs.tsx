"use client"

import Link from "next/link"
import { Archive } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogBody,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import { ListSkeleton } from "@/shared/ui/list-skeleton"
import type { Client } from "@/lib/types"
import type { ClientContactInput } from "../types/client-contact-types"
import { ClientForm } from "./client-form"
import type { ClientWithMeta } from "./client-directory-types"

type DupError = { msg: string; existing: Client }

export function CreateClientDialog({
  open,
  onOpenChange,
  dupError,
  saving,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  dupError: DupError | null
  saving: boolean
  onSubmit: (data: Partial<Client> & { contacts: ClientContactInput[] }) => Promise<void>
}) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onOpenChange(false) }}>
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
          <ClientForm formId="create-client-form" initial={{}} onSubmit={onSubmit} saving={saving} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" form="create-client-form" variant="primary" loading={saving}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function EditClientDialog({
  editClient,
  editContacts,
  editContactsLoading,
  dupError,
  saving,
  onClose,
  onSubmit,
}: {
  editClient: Client | null
  editContacts: ClientContactInput[] | null
  editContactsLoading: boolean
  dupError: DupError | null
  saving: boolean
  onClose: () => void
  onSubmit: (data: Partial<Client> & { contacts: ClientContactInput[] }) => Promise<void>
}) {
  return (
    <Dialog open={!!editClient} onOpenChange={o => { if (!o) onClose() }}>
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
          {editClient && !editContactsLoading && editContacts && (
            <ClientForm
              formId="edit-client-form"
              initial={editClient}
              initialContacts={editContacts}
              onSubmit={onSubmit}
              saving={saving}
            />
          )}
          {editClient && editContactsLoading && (
            <ListSkeleton rows={3} className="space-y-2 py-2" />
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="edit-client-form" variant="primary" loading={saving}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ArchiveClientDialog({
  archiveClient,
  archiving,
  onOpenChange,
  onConfirm,
}: {
  archiveClient: ClientWithMeta | null
  archiving: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
}) {
  return (
    <Dialog open={!!archiveClient} onOpenChange={o => { if (!o && !archiving) onOpenChange(false) }}>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={archiving}>Cancel</Button>
          <Button
            variant="primary"
            loading={archiving}
            disabled={archiving}
            className="bg-wn hover:bg-wn/90"
            onClick={() => void onConfirm()}
          >
            <Archive className="h-3.5 w-3.5" /> Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
