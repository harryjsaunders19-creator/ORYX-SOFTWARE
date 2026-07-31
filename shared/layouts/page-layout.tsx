"use client"
import { Fragment } from "react"
import Link from "next/link"
import { ArrowLeft, ChevronLeft, ChevronRight, Lock, Search } from "lucide-react"
import { cn } from "@/shared/utils"
import { Input } from "@/shared/ui/input"
import { Button } from "@/shared/ui/button"
import { Typography } from "@/shared/design/typography"
import { OryxLogo } from "@/shared/branding/oryx-logo"

/** Stitch surface — bordered card, minimal shadow. */
export const surfaceCard = "oryx-surface-card bg-sr border border-bd rounded-xl"

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
        <h1 className={cn(Typography.PageTitle, "oryx-page-title text-t1")}>{title}</h1>
        {description != null && (
          <p className={cn(Typography.Small, "mt-2 text-t3")}>{description}</p>
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
      "oryx-surface-card bg-sr border border-bd rounded-xl overflow-hidden",
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
        <p className={cn(Typography.CardTitle, "text-t1")}>{title}</p>
        {count != null && count > 0 && (
          <span className={cn(Typography.Badge, "rounded-full h-5 min-w-[20px] px-1.5 flex items-center justify-center bg-pg text-t2 shrink-0 tabular-nums")}>
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
      <tr className={cn("bg-surface-low border-b border-bd sticky top-0 z-[1]", Typography.TableHead)}>
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
      Typography.TableHead,
      "px-4 py-2.5 text-t3 whitespace-nowrap",
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
    <Link href={href} className={cn(Typography.Helper, "inline-flex items-center gap-1.5 text-t3 hover:text-t2 mb-4")}>
      <ArrowLeft className="h-3.5 w-3.5" />
      {children}
    </Link>
  )
}

/** Stitch KPI tile — large value, optional subtitle. Neutral chrome only. */
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
      "oryx-surface-card rounded-xl border border-bd bg-sr p-5 transition-colors duration-150 hover:border-bds",
      className,
    )}>
      <p className={cn(Typography.Stat, "mb-2", valueClassName ?? "text-t1")}>{value}</p>
      <p className={cn(Typography.Small, "font-medium text-t2")}>{label}</p>
      {sub != null && <p className={cn(Typography.Helper, "mt-1 text-t3")}>{sub}</p>}
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
        <p className={cn(Typography.BodyLarge, "font-semibold text-t2")}>{title}</p>
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
              Typography.Nav,
              "flex items-center gap-1.5 px-3 py-2.5 border-b-2 -mb-px transition-colors whitespace-nowrap",
              active === id ? "border-ac text-ac" : "border-transparent text-t3 hover:text-t2",
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
            {label}
            {count != null && count > 0 && (
              <span className={cn(Typography.Badge, "ml-0.5 min-w-[18px] h-5 px-1.5 flex items-center justify-center rounded-full bg-pg text-t2 tabular-nums")}>
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
        Typography.Helper,
        "flex items-center justify-between gap-3 text-t3",
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
        <span className={cn(Typography.Helper, "text-t2 px-2 tabular-nums min-w-[56px] text-center")}>
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
    <nav className={cn(Typography.Helper, "flex items-center gap-1.5 text-t3 mb-6")}>
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
                "font-medium text-t1 truncate",
                item.mono && Typography.DrawingNumber,
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
          <p className={cn(Typography.Small, "font-medium text-t1")}>{title}</p>
          {description && <p className={cn(Typography.Helper, "text-t3 mt-1")}>{description}</p>}
        </div>
        {action}
      </div>
    </div>
  )
}

/** Auth form title inside the login card — Stitch Login - ORYX OS. */
export function AuthBrand({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8 text-center">
      <h1 className={cn(Typography.CardTitle, "font-semibold text-t1")}>{title}</h1>
      {subtitle ? (
        <p className={cn(Typography.Small, "mt-2 text-t3")}>{subtitle}</p>
      ) : null}
    </div>
  )
}

/**
 * Centred auth shell — Stitch “Login - ORYX OS”.
 * Brand mark above the card, secure badge below, footer chrome.
 */
export function AuthLayout({
  children,
  showSecureBadge = true,
}: {
  children: React.ReactNode
  showSecureBadge?: boolean
}) {
  const year = new Date().getFullYear()

  return (
    <div className="flex min-h-screen flex-col bg-s0 text-t1">
      <main className="flex flex-grow flex-col items-center justify-center px-4 py-8 md:px-10">
        <div className="mb-8 flex flex-col items-center">
          <OryxLogo variant="login" className="mb-3 bg-transparent" priority />
          <span
            className={cn(
              Typography.SectionHeading,
              "tracking-tighter uppercase text-t1",
            )}
          >
            ORYX OS
          </span>
        </div>

        <div
          className={cn(
            "w-full max-w-[440px] rounded-[18px] border border-jobs-panel-bd bg-jobs-panel p-6 md:p-8",
            "shadow-jobs-panel",
          )}
        >
          {children}
        </div>

        {showSecureBadge ? (
          <div className="mt-6 flex items-center gap-1.5 text-t3">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <p className={cn(Typography.Helper, "font-semibold uppercase tracking-wide")}>
              Secure enterprise authentication endpoint
            </p>
          </div>
        ) : null}
      </main>

      <footer className="mt-auto flex w-full flex-col items-center justify-between gap-4 border-t border-bd bg-s0 px-6 py-6 md:flex-row md:px-10">
        <div className="flex flex-col items-center gap-2 md:flex-row md:gap-4">
          <span className={cn(Typography.Helper, "font-bold text-t1")}>ORYX OS</span>
          <span className={cn(Typography.Helper, "text-center text-t3 md:text-left")}>
            © {year} ORYX OS. Engineering Precision for Scaffold Design.
          </span>
        </div>
        <div className="flex flex-wrap justify-center gap-6">
          <span className={cn(Typography.Helper, "text-t3")}>Terms of Service</span>
          <span className={cn(Typography.Helper, "text-t3")}>Privacy Policy</span>
          <span className={cn(Typography.Helper, "text-t3")}>System Status</span>
        </div>
      </footer>
    </div>
  )
}
