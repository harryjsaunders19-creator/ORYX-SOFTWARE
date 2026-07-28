"use client"

import { memo } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { RotateCcw, Archive, ChevronRight } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/utils/utils"
import type { Client } from "@/lib/types"
import type { ClientWithMeta } from "./client-directory-types"

export const ClientMobileCard = memo(function ClientMobileCard({
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
    <div className={cn(
      "rounded-xl border border-bd bg-sr shadow-card p-3.5 space-y-2.5",
      !c.active && "opacity-60",
    )}>
      <Link href={`/clients/${c.id}`} prefetch={false} className="block min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-semibold text-t1">{c.name}</p>
              {!c.active && (
                <span className="type-helper bg-t1/[0.06] text-t3 rounded-full px-2 font-medium">Archived</span>
              )}
              {c.onHold && (
                <span className="type-helper bg-dn-bg text-dn rounded-full px-2 font-medium">On Hold</span>
              )}
            </div>
            {c.contactName && <p className="text-xs text-t3 mt-0.5">{c.contactName}</p>}
          </div>
          <ChevronRight className="h-4 w-4 text-t4 shrink-0 mt-0.5" />
        </div>
      </Link>

      {(c.email || c.phone) && (
        <div className="text-xs text-t3 space-y-0.5">
          {c.email && <p className="truncate">{c.email}</p>}
          {c.phone && <p>{c.phone}</p>}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-bd/60 text-xs text-t4">
        <span className="tabular-nums">{format(new Date(c.createdAt), "d MMM yyyy")}</span>
        {isAdmin && (
          <span className={cn("font-semibold tabular-nums", c.activeJobCount > 0 ? "text-t2" : "text-t4")}>
            {c.activeJobCount} active job{c.activeJobCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {isAdmin && (
        <div className="flex items-center gap-1 justify-end pt-1" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => onEdit(c)}>Edit</Button>
          {!c.active ? (
            <Button variant="ghost" size="icon-sm" onClick={() => onRestore(c)} title="Restore" className="text-t4 hover:text-ac">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon-sm" onClick={() => onArchive(c)} title="Archive client" className="text-t4 hover:text-wn-tx hover:bg-wn-bg">
              <Archive className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
})
