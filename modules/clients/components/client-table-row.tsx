"use client"

import { memo } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { RotateCcw, Archive, ChevronRight } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/utils/utils"
import type { Client } from "@/lib/types"
import type { ClientWithMeta } from "./client-directory-types"

export const ClientTableRow = memo(function ClientTableRow({
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
          {!c.active && <span className="type-helper bg-t1/[0.06] text-t3 rounded-full px-2 font-medium">Archived</span>}
          {c.onHold && <span className="type-helper bg-dn-bg text-dn rounded-full px-2 font-medium whitespace-nowrap">On Hold</span>}
          <ChevronRight className="h-3.5 w-3.5 text-t4" />
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
