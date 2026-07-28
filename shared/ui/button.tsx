"use client"
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/shared/utils"
import { Typography } from "@/shared/design/typography"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline"
  size?:    "sm" | "md" | "icon-sm" | "icon"
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", asChild, loading, disabled, children, style, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          Typography.Button,
          "inline-flex items-center justify-center gap-1.5 rounded-lg",
          "select-none whitespace-nowrap cursor-pointer transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ac/30 focus-visible:ring-offset-1",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          variant === "primary"   && "bg-ac text-on-ac hover:bg-ach",
          variant === "secondary" && "bg-sr border border-bd text-t1 hover:bg-pg",
          variant === "outline"   && "border border-bd text-t2 hover:text-t1 hover:border-bds bg-transparent",
          variant === "ghost"     && "text-t3 hover:text-t2 hover:bg-pg",
          variant === "danger"    && "bg-dn text-sr hover:bg-dnh",
          size === "md"           && "h-9 px-4",
          size === "sm"           && "h-[30px] px-3",
          size === "icon"         && "h-9 w-9",
          size === "icon-sm"      && "h-[30px] w-[30px]",
          className,
        )}
        style={style}
        {...props}
      >
        {loading ? (
          <>
            <svg className="h-3.5 w-3.5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
              <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
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
