"use client"
import Link from "next/link"
import { ArrowLeft, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { OryxLogo } from "@/components/oryx-logo"

/** Stitch surface — white card with border, radius, shadow. */
export const surfaceCard = "bg-sr border border-bd rounded-2xl shadow-card"

/** Standard page wrapper — Stitch canvas padding below top bar. */
export function PageShell({ children, className, wide }: {
  children: React.ReactNode
  className?: string
  wide?: boolean
}) {
  return (
    <div className={cn("px-8 py-8 w-full", !wide && "max-w-[1400px]", className)}>
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
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-8">
      <div className="min-w-0">
        <h1 className="text-[32px] font-bold text-t1 tracking-tight leading-[1.15]">{title}</h1>
        {description != null && (
          <p className="text-sm text-t3 mt-1.5">{description}</p>
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
    <div className={cn("relative flex-1 max-w-md", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-t4 pointer-events-none" />
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? "Search…"}
        className="pl-10 bg-surface-low border-none shadow-none h-10 rounded-full focus-visible:ring-2 focus-visible:ring-ac/20"
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
      "bg-sr border border-bd rounded-2xl shadow-card overflow-hidden",
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
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-sm">{children}</table>
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
export function KpiTile({ label, value, sub, accent = "#4640DE", valueClassName, className }: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  accent?: string
  valueClassName?: string
  className?: string
}) {
  return (
    <div className={cn("relative overflow-hidden p-4", surfaceCard, className)}>
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} />
      <p className="text-[11px] font-semibold text-t3 uppercase tracking-wider mb-1">{label}</p>
      <p className={cn("text-2xl font-bold tabular-nums leading-tight", valueClassName ?? "text-t1")}>{value}</p>
      {sub != null && <p className="text-xs text-t4 mt-1">{sub}</p>}
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
    <div className="flex items-center justify-between border-b border-bd mb-4">
      <div className="flex items-center gap-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
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

/** Auth brand block — form panel title; full brand on mobile only. */
export function AuthBrand({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <>
      <div className="flex flex-col items-center mb-6 lg:hidden">
        <div className="rounded-xl bg-[#1C1C1E] px-5 py-4">
          <OryxLogo variant="auth" priority />
        </div>
      </div>
      <h1 className="text-2xl font-bold text-t1 text-center lg:text-left">{title}</h1>
      {subtitle && <p className="text-sm text-t3 mt-1 mb-7 text-center lg:text-left">{subtitle}</p>}
      {!subtitle && <div className="mb-7" />}
    </>
  )
}

/** Centred auth — Stitch split layout on large screens. */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-pg">
      {/* Brand panel */}
      <div
        className="hidden lg:flex lg:w-[44%] xl:w-[42%] flex-col justify-between p-12 text-white relative overflow-hidden"
        style={{
          background: "linear-gradient(145deg, #3935B8 0%, #4640DE 45%, #1C1C1E 100%)",
        }}
      >
        <div className="relative z-10">
          <OryxLogo variant="auth-panel" className="mb-8" priority />
          <h2 className="text-3xl font-bold tracking-tight leading-tight max-w-sm">
            ORYX Scaffold Design Dashboard
          </h2>
        </div>
        <p className="text-xs text-white/50 relative z-10">Oryx Design Ltd · Scaffold Consultancy</p>
        <div
          className="absolute -right-20 -bottom-20 w-80 h-80 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)" }}
        />
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[420px] bg-sr border border-bd rounded-2xl p-8 sm:p-10 shadow-card">
          {children}
        </div>
      </div>
    </div>
  )
}
