"use client"
import Link from "next/link"
import { ArrowLeft, Search } from "lucide-react"
import { cn } from "@/shared/utils"
import { Input } from "@/shared/ui/input"

/** Stitch surface — bordered card, minimal shadow. */
export const surfaceCard = "oryx-surface-card bg-sr border border-bd rounded-md"

/** Standard page wrapper — Stitch canvas padding below top bar. */
export function PageShell({ children, className, wide }: {
  children: React.ReactNode
  className?: string
  wide?: boolean
}) {
  return (
    <div className={cn("px-4 py-4 w-full min-w-0 sm:px-6 sm:py-6 lg:px-8 lg:py-8", !wide && "max-w-[1400px]", className)}>
      {children}
    </div>
  )
}

export function PageHeader({ title, description, actions }: {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4 sm:mb-8">
      <div className="min-w-0">
        <h1 className="oryx-page-title text-t1">{title}</h1>
        {description != null && (
          <p className="mt-1 text-sm text-t3">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>
      )}
    </div>
  )
}

export function SearchField({ value, onChange, placeholder, className }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn("relative flex-1 w-full sm:max-w-md", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-t4 pointer-events-none" />
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? "Search…"}
        className="pl-10 bg-surface-low border border-bd shadow-none h-10 rounded focus-visible:ring-2 focus-visible:ring-t1/20"
        style={{ paddingLeft: "40px" }}
      />
    </div>
  )
}

/** Card container for tables and dashboard sections — Stitch Level 1 surface. */
export function DataPanel({ children, className, noPadding }: {
  children: React.ReactNode
  className?: string
  noPadding?: boolean
}) {
  return (
    <div className={cn(
      "oryx-surface-card bg-sr border border-bd rounded-md overflow-hidden",
      !noPadding && "p-0",
      className,
    )}>
      {children}
    </div>
  )
}

export function PanelHeader({ title, count, action }: {
  title: string
  count?: number
  action?: React.ReactNode
}) {
  return (
    <div className="px-4 py-3 border-b border-bd flex items-center justify-between shrink-0 bg-sr">
      <div className="flex items-center gap-2 min-w-0">
        <p className="text-sm font-semibold text-t1">{title}</p>
        {count != null && count > 0 && (
          <span className="text-[11px] font-bold rounded-full h-5 min-w-[20px] px-1.5 flex items-center justify-center bg-pg text-t2 shrink-0 tabular-nums">
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  )
}

export function TableShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto overscroll-x-contain -mx-4 px-4 sm:mx-0 sm:px-0", className)}>
      {children}
    </div>
  )
}

export function TableHead({ children }: { children: React.ReactNode }) {
  return (
      <thead>
      <tr className="bg-surface-low border-b border-bd text-xs sticky top-0 z-[1]">
        {children}
      </tr>
    </thead>
  )
}

export function Th({ children, className, align }: {
  children?: React.ReactNode
  className?: string
  align?: "left" | "right" | "center"
}) {
  return (
    <th className={cn(
      "px-4 py-2.5 font-semibold text-t3 uppercase tracking-wider whitespace-nowrap",
      align === "right" && "text-right",
      align === "center" && "text-center",
      (!align || align === "left") && "text-left",
      className,
    )}>
      {children}
    </th>
  )
}

/** Back navigation — consistent across detail and import pages. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-xs text-t3 hover:text-t2 mb-4">
      <ArrowLeft className="h-3.5 w-3.5" />
      {children}
    </Link>
  )
}

/** Stitch KPI tile — accent bar, large value, optional subtitle. */
export function KpiTile({ label, value, sub, accent = "var(--color-ac)", valueClassName, className }: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  accent?: string
  valueClassName?: string
  className?: string
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-[#E5E7EB] bg-sr p-4 shadow-sm transition-shadow hover:shadow-md sm:p-6", className)}>
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} />
      <p className={cn("mb-2 text-3xl font-semibold tabular-nums leading-none tracking-tight sm:text-[48px]", valueClassName ?? "text-t1")}>{value}</p>
      <p className="font-mono text-xs uppercase tracking-widest text-t3">{label}</p>
      {sub != null && <p className="mt-1 text-xs text-t4">{sub}</p>}
    </div>
  )
}

/** Titled content panel — job detail sections, analytics blocks, etc. */
export function DetailPanel({ title, children, className, headerAction }: {
  title: string
  children: React.ReactNode
  className?: string
  headerAction?: React.ReactNode
}) {
  return (
    <div className={cn(surfaceCard, "overflow-hidden", className)}>
      <div className="px-4 py-3 border-b border-bd flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-t3 uppercase tracking-wider">{title}</p>
        {headerAction}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}

/** Horizontal tab bar — billing, multi-view pages. */
export function TabBar({ tabs, active, onChange, trailing }: {
  tabs: { id: string; label: string; icon?: React.ElementType }[]
  active: string
  onChange: (id: string) => void
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-bd mb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-1 overflow-x-auto overscroll-x-contain thin-scroll -mx-1 px-1 pb-px">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors min-h-[44px]",
              active === id ? "border-ac text-ac" : "border-transparent text-t3 hover:text-t2",
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {label}
          </button>
        ))}
      </div>
      {trailing}
    </div>
  )
}

/** Toolbar row above tables — search + actions in a raised card. */
export function ToolbarCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(surfaceCard, "px-4 py-3 mb-4 flex items-center gap-2 flex-wrap", className)}>
      {children}
    </div>
  )
}

export function EmptyPanel({ icon: Icon, title, description, action }: {
  icon: React.ElementType
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="py-14 px-6 text-center">
      <div className="inline-flex flex-col items-center gap-3 max-w-sm mx-auto">
        <div className="w-11 h-11 rounded-lg border border-bd flex items-center justify-center bg-pg">
          <Icon className="h-5 w-5 text-t4" />
        </div>
        <div>
          <p className="text-sm font-medium text-t1">{title}</p>
          {description && <p className="text-xs text-t3 mt-1">{description}</p>}
        </div>
        {action}
      </div>
    </div>
  )
}

/** Auth brand block — form panel title. */
export function AuthBrand({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <>
      <div className="flex items-center gap-3 mb-6 lg:hidden">
        <div className="size-8 text-t1 shrink-0">
          <svg className="w-full h-full" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <path d="M8.57829 8.57829C5.52816 11.6284 3.451 15.5145 2.60947 19.7452C1.76794 23.9758 2.19984 28.361 3.85056 32.3462C5.50128 36.3314 8.29667 39.7376 11.8832 42.134C15.4698 44.5305 19.6865 45.8096 24 45.8096C28.3135 45.8096 32.5302 44.5305 36.1168 42.134C39.7033 39.7375 42.4987 36.3314 44.1494 32.3462C45.8002 28.361 46.2321 23.9758 45.3905 19.7452C44.549 15.5145 42.4718 11.6284 39.4217 8.57829L24 24L8.57829 8.57829Z" fill="currentColor" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-bold uppercase tracking-tight text-t1">Oryx Design</p>
        </div>
      </div>
      <h1 className="text-xl font-bold text-t1 text-center lg:text-left">{title}</h1>
      {subtitle && <p className="text-sm text-t3 mt-1 mb-7 text-center lg:text-left">{subtitle}</p>}
      {!subtitle && <div className="mb-7" />}
    </>
  )
}

/** Centred auth — Stitch monochrome split layout. */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-pg">
      <div className="hidden lg:flex lg:w-[44%] xl:w-[42%] flex-col justify-between p-12 text-sr bg-t1 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-10">
            <div className="size-10 text-sr shrink-0">
              <svg className="w-full h-full" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <path d="M8.57829 8.57829C5.52816 11.6284 3.451 15.5145 2.60947 19.7452C1.76794 23.9758 2.19984 28.361 3.85056 32.3462C5.50128 36.3314 8.29667 39.7376 11.8832 42.134C15.4698 44.5305 19.6865 45.8096 24 45.8096C28.3135 45.8096 32.5302 44.5305 36.1168 42.134C39.7033 39.7375 42.4987 36.3314 44.1494 32.3462C45.8002 28.361 46.2321 23.9758 45.3905 19.7452C44.549 15.5145 42.4718 11.6284 39.4217 8.57829L24 24L8.57829 8.57829Z" fill="currentColor" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight uppercase leading-none">Oryx Design</h2>
            </div>
          </div>
          <p className="text-2xl font-semibold tracking-tight leading-tight max-w-sm text-sr/90">
            Engineering operations dashboard for scaffold design consultancy.
          </p>
        </div>
        <p className="text-xs text-t4 relative z-10">Oryx Design Ltd · Scaffold Consultancy</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[420px] oryx-surface-card bg-sr border border-bd rounded-md p-8 sm:p-10">
          {children}
        </div>
      </div>
    </div>
  )
}
