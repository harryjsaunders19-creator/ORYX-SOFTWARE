"use client"

import Link from "next/link"
import { Ban, CheckCircle2, ChevronRight } from "lucide-react"
import type { ClientHoldWithClient } from "@/lib/types"

function clientInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
  }
  return (name.trim().slice(0, 2) || "?").toUpperCase()
}

export function DashboardHoldsPanel({
  holds,
  clientsOnHold,
}: {
  holds: ClientHoldWithClient[]
  clientsOnHold?: number
}) {
  return (
    <section>
      <div className="mb-6 flex items-center gap-3">
        <Ban className="h-5 w-5 text-[#4c4546] dark:text-t3" aria-hidden />
        <h3 className="text-2xl font-semibold tracking-tight text-t1">Clients on Hold</h3>
        {(clientsOnHold ?? holds.length) > 0 && (
          <span className="rounded-md bg-[var(--stitch-search-bg,#f3f3f5)] px-2 py-0.5 text-xs font-bold text-t2 tabular-nums">
            {clientsOnHold ?? holds.length}
          </span>
        )}
      </div>

      {holds.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-bd bg-sr px-6 py-12 shadow-card">
          <CheckCircle2 className="h-5 w-5 text-t4" aria-hidden />
          <p className="text-sm text-t3">No clients are currently on hold.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {holds.map(hold => (
            <Link
              key={hold.id}
              href={`/clients/${hold.clientId}`}
              className="group flex items-center justify-between rounded-xl border border-bd bg-sr p-5 shadow-card transition-shadow hover:shadow-sm"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-nested-surface text-sm font-bold text-t1">
                  {clientInitials(hold.clientName)}
                </div>
                <div className="min-w-0">
                  <h4 className="truncate text-sm font-medium text-t1">{hold.clientName}</h4>
                  <p className="text-[12px] text-t3">
                    Status:{" "}
                    <span className="font-medium text-[#ba1a1a]">{hold.reason || "On hold"}</span>
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-t4 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      )}

      {(clientsOnHold ?? 0) > holds.length && (
        <div className="mt-4">
          <Link
            href="/clients/hold-list"
            className="text-xs font-semibold text-[#4c4546] underline decoration-dotted underline-offset-4 hover:text-black dark:text-t3"
          >
            View all on hold
          </Link>
        </div>
      )}
    </section>
  )
}
