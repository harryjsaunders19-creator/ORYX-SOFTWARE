/**
 * dialog.tsx
 *
 * Z-index contract (all portals render into document.body):
 *   sidebar          z-10   (relative + isolate on <aside>)
 *   modal backdrop   z-[100]
 *   modal panel      z-[101]
 *   toasts           z-[200]
 *
 * Critical: bg-sr and the inline style={{ background: '#fff' }} are BOTH set
 * on the modal panel. The inline style is a belt-and-suspenders guarantee that
 * the modal is always solid white, regardless of CSS class generation status.
 */
"use client"
import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/shared/utils"

export const Dialog        = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogPortal  = DialogPrimitive.Portal
export const DialogClose   = DialogPrimitive.Close

/* ── Backdrop ────────────────────────────────────────────────────
 * Renders into document.body (via Portal), so it is a sibling of
 * <body>'s children, not a child of the sidebar.
 * z-[100] ensures it covers the sidebar (z-10) completely.
 */
export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-[100] backdrop-blur-[2px]", className)}
    style={{ backgroundColor: "rgba(0, 0, 0, 0.4)" }}
    {...props}
  />
))
DialogOverlay.displayName = "DialogOverlay"

/* ── Modal panel ─────────────────────────────────────────────────
 * Also renders into document.body via DialogPortal.
 * z-[101] sits above the backdrop (z-[100]).
 *
 * Background uses var(--color-sr) — resolves to white in light mode,
 * dark surface in dark mode. Both the Tailwind class (bg-sr) and
 * inline style are set for specificity coverage.
 */
export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  size?: "sm" | "md" | "lg"
}

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, size = "md", ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Position: centred in viewport, above backdrop
        "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101]",
        // Sizing
        "w-[calc(100vw-2rem)] max-h-[85vh]",
        size === "sm" && "max-w-[400px]",
        size === "md" && "max-w-[640px]",
        size === "lg" && "max-w-[900px]",
        // Appearance — bg-sr provides the Tailwind class; inline style is the fallback.
        // rounded-xl → --radius-xl (12px) for cards / modals.
        "bg-sr border border-bd rounded-xl shadow-modal",
        // Layout: flex column so header/footer are sticky and body scrolls
        "flex flex-col overflow-hidden",
        className,
      )}
      style={{ background: "var(--color-sr)", border: "1px solid var(--color-bd)", borderRadius: "var(--radius-xl)" }}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className={cn(
          "absolute right-4 top-4 z-10",
          "h-7 w-7 rounded-lg flex items-center justify-center",
          "text-t4 hover:text-t2 hover:bg-pg",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ac",
        )}
        style={{ color: "var(--color-t4)" }}
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = "DialogContent"

/* ── Structural sub-components ───────────────────────────────────
 * Inline styles supplement Tailwind classes as a hard fallback.
 */

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("shrink-0 px-7 pt-6 pb-5 border-b border-bd", className)}
      style={{ borderBottom: "1px solid var(--color-bd)", flexShrink: 0 }}
      {...props}
    />
  )
}
DialogHeader.displayName = "DialogHeader"

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex-1 overflow-y-auto thin-scroll px-7 py-6", className)}
      style={{ flex: "1 1 0%", overflowY: "auto", padding: "24px 28px" }}
      {...props}
    />
  )
}
DialogBody.displayName = "DialogBody"

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "shrink-0 px-7 py-5 border-t border-bd bg-pg",
        "flex items-center justify-between gap-3",
        className,
      )}
      style={{
        flexShrink: 0,
        padding: "20px 28px",
        borderTop: "1px solid var(--color-bd)",
        background: "var(--color-pg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
      }}
      {...props}
    />
  )
}
DialogFooter.displayName = "DialogFooter"

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-base font-semibold text-t1", className)}
    style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-t1)", margin: 0, letterSpacing: "-0.01em" }}
    {...props}
  />
))
DialogTitle.displayName = "DialogTitle"

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-t3 mt-0.5", className)}
    style={{ fontSize: "14px", color: "var(--color-t3)", marginTop: "3px" }}
    {...props}
  />
))
DialogDescription.displayName = "DialogDescription"
