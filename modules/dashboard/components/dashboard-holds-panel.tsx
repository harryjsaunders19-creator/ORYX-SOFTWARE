"use client"

import Link from "next/link"
import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { Panel, PanelEmpty } from "./dashboard-stats-primitives"
import type { ClientHoldWithClient } from "@/lib/types"

export function DashboardHoldsPanel({
  holds,
  clientsOnHold,
}: {
  holds: ClientHoldWithClient[]
  clientsOnHold?: number
}) {
  return (
    <Panel
      title="Clients on hold"
      count={clientsOnHold}
      countTone="due"
      viewAllHref="/clients/hold-list"
    >
      {holds.length === 0 ? (
        <PanelEmpty icon={CheckCircle2} message="No clients are currently on hold." />
      ) : (
        <ul className="divide-y divide-bd">
          {holds.map(hold => {
            const initial = (hold.clientName?.trim()?.[0] ?? "?").toUpperCase()
            return (
              <li key={hold.id}>
                <Link
                  href={`/clients/${hold.clientId}`}
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-low"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pg text-xs font-semibold text-t2">
                    {initial}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-t1">{hold.clientName}</p>
                    <p className="mt-0.5 truncate text-xs text-t3">{hold.reason}</p>
                  </div>
                  <AlertTriangle className="h-4 w-4 shrink-0 text-wn-ic" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
