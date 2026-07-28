"use client"
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/shared/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline"
  size?:    "sm" | "md" | "icon-sm" | "icon"
  asChild?: boolean
  loading?: boolean
}

// Inline style maps for each variant — guaranteed to render regardless of Tailwind output
const VARIANT_STYLES: Record<string, React.CSSProperties> = {
  primary:   { backgroundColor: "var(--color-ac)", color: "var(--color-on-ac)" },
  secondary: { backgroundColor: "var(--color-sr)", color: "var(--color-t1)", border: "1px solid var(--color-bd)" },
  outline:   { backgroundColor: "transparent", color: "var(--color-t2)", border: "1px solid var(--color-bd)" },
  ghost:     { backgroundColor: "transparent", color: "var(--color-t3)" },
  danger:    { backgroundColor: "var(--color-dn)", color: "var(--color-on-ac)" },
}

const SIZE_STYLES: Record<string, React.CSSProperties> = {
  md:      { height: "36px", padding: "0 16px", fontSize: "14px" },
  sm:      { height: "30px", padding: "0 12px", fontSize: "12px" },
  icon:    { height: "36px", width: "36px", padding: "0", fontSize: "14px" },
  "icon-sm": { height: "30px", width: "30px", padding: "0", fontSize: "12px" },
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", asChild, loading, disabled, children, style, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded font-medium",
          "select-none whitespace-nowrap cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ac focus-visible:ring-offset-1",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          variant === "primary"   && "bg-ac text-on-ac hover:bg-ach",
          variant === "secondary" && "bg-sr border border-bd text-t1 hover:bg-pg",
          variant === "outline"   && "border border-bd text-t2 hover:text-t1 hover:border-bds bg-transparent",
          variant === "ghost"     && "text-t3 hover:text-t2 hover:bg-pg",
          variant === "danger"    && "bg-dn text-sr hover:bg-dnh",
          size === "md"           && "h-9 px-4 text-sm",
          size === "sm"           && "h-[30px] px-3 text-xs",
          size === "icon"         && "h-9 w-9 text-sm",
          size === "icon-sm"      && "h-[30px] w-[30px] text-xs",
          className,
        )}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: className?.includes("rounded-full") ? "9999px" : "var(--radius-lg)",
          fontWeight: 500,
          userSelect: "none",
          whiteSpace: "nowrap",
          gap: "6px",
          ...VARIANT_STYLES[variant],
          ...SIZE_STYLES[size],
          ...style,
        }}
        {...props}
      >
        {loading ? (
          <>
            <svg className="h-3.5 w-3.5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden style={{ width: "14px", height: "14px", flexShrink: 0, animation: "spin 1s linear infinite" }}>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }} />
              <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" style={{ opacity: 0.75 }} />
            </svg>
            {children}
          </>
        ) : children}
      </Comp>
    )
  }
)
Button.displayName = "Button"
export { Button }
