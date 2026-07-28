"use client"
import { cn } from "@/shared/utils/utils"

export function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="h-4 w-40 skeleton rounded" />
      <div className="h-9 w-72 skeleton rounded" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 skeleton rounded-xl" />
        ))}
      </div>
      <div className="h-64 skeleton rounded-xl" />
    </div>
  )
}

export function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-2 border-b border-bd/70 pb-4 last:border-0 last:pb-0">
      <span className="text-sm font-medium text-t3">{label}</span>
      <span className="text-base font-semibold text-t1 leading-snug">
        {value?.trim() ? value : <span className="font-normal text-t4 italic">Not set</span>}
      </span>
    </div>
  )
}

/**
 * KpiCard with two visual variants:
 *   "bare"  — job-detail style: no border/bg wrapper, text-lg font-semibold value
 *   "card"  — parent-dashboard style: rounded border card, type-body-lg value
 */
export function KpiCard({
  label,
  value,
  badge,
  variant = "card",
}: {
  label: string
  value: string
  badge?: string | null
  variant?: "bare" | "card"
}) {
  if (variant === "bare") {
    return (
      <div className="space-y-2">
        <p className="type-label text-t3">{label}</p>
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-lg font-semibold text-t1 truncate font-mono tabular-nums">{value}</p>
          {badge ? (
            <span className="shrink-0 px-2 py-0.5 rounded-md text-xs font-medium bg-wn-bg text-wn-tx">
              {badge}
            </span>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-bd bg-sr p-4">
      <p className="type-label text-t3 mb-2">{label}</p>
      <div className="flex items-center gap-2 min-w-0">
        <p className="type-body-lg text-t1 truncate font-mono tabular-nums">{value}</p>
        {badge ? (
          <span className="shrink-0 px-2 py-0.5 rounded-md text-xs font-medium bg-wn-bg text-wn-tx">
            {badge}
          </span>
        ) : null}
      </div>
    </div>
  )
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode
  tone?: "ok" | "ac" | "dn" | "neutral"
}) {
  const tones = {
    ok: "bg-ok-bg text-ok-tx",
    ac: "bg-ac-bg text-ac",
    dn: "bg-dn-bg text-dn-tx",
    neutral: "bg-pg text-t2 border border-bd",
  }
  const dots = {
    ok: "bg-ok-ic",
    ac: "bg-ac",
    dn: "bg-dn",
    neutral: "bg-t3",
  }
  return (
    <span className={cn(
      "inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold",
      tones[tone],
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dots[tone])} />
      {children}
    </span>
  )
}
