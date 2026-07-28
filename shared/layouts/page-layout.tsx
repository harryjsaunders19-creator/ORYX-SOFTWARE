"use client"
import { Fragment } from "react"
import Link from "next/link"
import { ArrowLeft, ChevronLeft, ChevronRight, Search } from "lucide-react"
import { cn } from "@/shared/utils"
import { Input } from "@/shared/ui/input"
import { Button } from "@/shared/ui/button"

/** Stitch surface — bordered card, minimal shadow. */
export const surfaceCard = "oryx-surface-card bg-sr border border-bd rounded-md"

/** Standard page wrapper — Stitch canvas padding below top bar. */
export function PageShell({ children, className, wide }: {
  children: React.ReactNode
  className?: string
  wide?: boolean
}) {
  return (
    <div className={cn("px-8 py-8 w-full max-md:px-4 max-md:py-4", !wide && "max-w-[1400px]", className)}>
      {children}
    </div>
  )
}

/** Vertical stack on the 8px grid — default page section rhythm. */
export function PageStack({ children, className, gap = "lg" }: {
  children: React.ReactNode
  className?: string
  gap?: "sm" | "md" | "lg"
}) {
  return (
    <div className={cn(
      gap === "sm" && "space-y-4",
      gap === "md" && "space-y-6",
      gap === "lg" && "space-y-8",
      className,
    )}>
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
        <h1 className="oryx-page-title text-t1">{title}</h1>
        {description != null && (
          <p className="mt-2 text-sm text-t3">{description}</p>
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
    <div className={cn("relative flex-1 max-w-md max-md:w-full", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-t4 pointer-events-none" />
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? "Search…"}
        className="pl-10 bg-surface-low border border-bd shadow-none h-9 rounded-lg focus-visible:ring-2 focus-visible:ring-t1/20"
        style={{ paddingLeft: "40px", height: "36px" }}
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
    <div className={cn("overflow-x-auto max-md:-mx-4 max-md:px-4", className)}>
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
export function KpiTile({ label, value, sub, valueClassName, className }: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  /** @deprecated Decorative accents removed — kept for call-site compatibility. */
  accent?: string
  valueClassName?: string
  className?: string
}) {
  return (
    <div className={cn(
      "oryx-surface-card rounded-xl border border-bd bg-sr p-6 transition-shadow hover:shadow-sm",
      className,
    )}>
      <p className={cn("mb-2 text-4xl font-semibold tabular-nums leading-none tracking-tight max-md:text-3xl", valueClassName ?? "text-t1")}>{value}</p>
      <p className="text-sm font-medium text-t2">{label}</p>
      {sub != null && <p className="mt-1 text-xs text-t3">{sub}</p>}
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

/** Horizontal tab bar — billing, archive, multi-view pages. */
export function TabBar({ tabs, active, onChange, trailing }: {
  tabs: { id: string; label: string; icon?: React.ElementType; count?: number }[]
  active: string
  onChange: (id: string) => void
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between border-b border-bd mb-4">
      <div className="flex items-center gap-1 max-md:overflow-x-auto max-md:thin-scroll">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
              active === id ? "border-ac text-ac" : "border-transparent text-t3 hover:text-t2",
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
            {label}
            {count != null && count > 0 && (
              <span className="ml-0.5 min-w-[18px] h-5 px-1.5 flex items-center justify-center rounded-full bg-pg text-[11px] font-bold text-t2 tabular-nums">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>
      {trailing}
    </div>
  )
}

/** Shared table pagination — icon chevrons, consistent copy. */
export function TablePagination({
  page,
  totalPages,
  onPageChange,
  total,
  pageSize,
  countLabel,
  hideWhenSingle = true,
  disabled = false,
  variant = "card",
  className,
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  total?: number
  pageSize?: number
  countLabel?: React.ReactNode
  hideWhenSingle?: boolean
  disabled?: boolean
  variant?: "card" | "inset" | "bare"
  className?: string
}) {
  if (hideWhenSingle && totalPages <= 1) return null

  const rangeLabel = total != null && pageSize != null
    ? (
      <>
        {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of{" "}
        <span className="font-semibold text-t2">{total.toLocaleString()}</span>
      </>
    )
    : countLabel

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 text-xs text-t3",
        variant === "card" && "px-4 py-3 mt-3 border border-bd rounded-xl bg-sr shadow-card",
        variant === "inset" && "px-4 py-3 border-t border-bd",
        variant === "bare" && "mt-4 px-1",
        className,
      )}
    >
      <p className="min-w-0 truncate">{rangeLabel}</p>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-t2 px-2 tabular-nums min-w-[56px] text-center">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

/** Detail-page breadcrumb — Jobs › drawing number. */
export function PageBreadcrumb({
  items,
}: {
  items: { label: React.ReactNode; onClick?: () => void; mono?: boolean; strike?: boolean }[]
}) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-t3 mb-6">
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
          {item.onClick ? (
            <button
              type="button"
              className="hover:text-t1 transition-colors"
              onClick={item.onClick}
            >
              {item.label}
            </button>
          ) : (
            <span
              className={cn(
                "font-semibold text-t1 truncate",
                item.mono && "font-mono",
                item.strike && "line-through opacity-70",
              )}
            >
              {item.label}
            </span>
          )}
        </Fragment>
      ))}
    </nav>
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
