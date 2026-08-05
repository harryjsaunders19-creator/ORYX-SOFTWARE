"use client"

import Link from "next/link"
import { differenceInCalendarDays, parseISO, isValid } from "date-fns"
import { Ban, ChevronRight } from "lucide-react"
import { cn } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import type { ClientHoldWithClient } from "@/lib/types"
import { DashboardEmptyState, DashboardSectionHeader } from "./dashboard-stats-primitives"

function clientInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
  }
  return (name.trim().slice(0, 2) || "?").toUpperCase()
}

function daysOnHoldLabel(addedAt: string): string | null {
  try {
    const added = parseISO(addedAt)
    if (!isValid(added)) return null
    const days = differenceInCalendarDays(new Date(), added)
    if (days < 0) return null
    if (days === 0) return "Added today"
    return `${days} day${days === 1 ? "" : "s"} on hold`
  } catch {
    return null
  }
}

export function DashboardHoldsPanel({
  holds,
  clientsOnHold,
}: {
  holds: ClientHoldWithClient[]
  clientsOnHold?: number
}) {
  const total = clientsOnHold ?? holds.length

  return (
    <section aria-labelledby="dashboard-holds-heading">
      <DashboardSectionHeader
        as="h2"
        id="dashboard-holds-heading"
        title="Clients on Hold"
        count={total}
        countTone="hold"
        icon={Ban}
        viewAllHref={total > holds.length ? "/clients/hold-list" : undefined}
        viewAllLabel="View all on hold"
      />

      {holds.length === 0 ? (
        <DashboardEmptyState message="No clients currently on hold" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {holds.map(hold => {
            const daysLabel = daysOnHoldLabel(hold.addedAt)
            const jobsLabel =
              hold.activeJobCount > 0
                ? `${hold.activeJobCount} active job${hold.activeJobCount === 1 ? "" : "s"}`
                : null
            const meta = [daysLabel, jobsLabel].filter(Boolean).join(" · ")

            return (
              <Link
                key={hold.id}
                href={`/clients/${hold.clientId}`}
                className={cn(
                  "group flex items-start justify-between gap-3 rounded-xl border border-wn-bd/70 bg-sr p-4 shadow-card",
                  "transition-all duration-150 hover:border-wn-bd hover:bg-hover-surface",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-t1/20",
                )}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-wn-bg text-xs font-bold text-wn-tx"
                    aria-hidden
                  >
                    {clientInitials(hold.clientName)}
                  </div>
                  <div className="min-w-0">
                    <h3 className={cn(Typography.BodyLarge, "truncate text-t1")}>
                      {hold.clientName}
                    </h3>
                    <p className={cn(Typography.Small, "mt-0.5 text-wn-tx")}>
                      {hold.reason || "On hold"}
                    </p>
                    {meta && (
                      <p className={cn(Typography.Helper, "mt-1 text-t2")}>{meta}</p>
                    )}
                  </div>
                </div>
                <ChevronRight
                  className="mt-1 h-4 w-4 shrink-0 text-t3 transition-colors group-hover:text-t1"
                  aria-hidden
                />
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
