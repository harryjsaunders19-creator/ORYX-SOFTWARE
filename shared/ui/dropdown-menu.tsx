"use client"
import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { Check } from "lucide-react"
import { cn } from "@/shared/utils"

export const DropdownMenu        = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuGroup   = DropdownMenuPrimitive.Group

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-[200] min-w-[180px] overflow-hidden rounded-xl border border-bd bg-sr p-1.5",
        className,
      )}
      style={{
        zIndex: 200,
        minWidth: "180px",
        overflow: "hidden",
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--color-bd)",
        backgroundColor: "var(--color-sr)",
        padding: "6px",
        boxShadow: "var(--shadow-modal)",
      }}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = "DropdownMenuContent"

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { danger?: boolean }
>(({ className, danger, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none",
      "focus:bg-pg data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
      danger ? "text-dn focus:bg-dn-bg" : "text-t1",
      className,
    )}
    style={{
      padding: "8px 10px",
      fontSize: "13px",
      borderRadius: "var(--radius-md)",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      cursor: "default",
      color: danger ? "var(--color-dn)" : "var(--color-t1)",
    }}
    {...props}
  />
))
DropdownMenuItem.displayName = "DropdownMenuItem"

export const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-md py-2 pl-7 pr-2.5 text-sm text-t1 outline-none",
      "focus:bg-pg data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
      className,
    )}
    style={{ padding: "8px 10px 8px 28px", fontSize: "13px", borderRadius: "var(--radius-md)", position: "relative", cursor: "default" }}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center" style={{ position: "absolute", left: "8px", display: "flex", alignItems: "center" }}>
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-3.5 w-3.5 text-ac" style={{ color: "var(--color-ac)" }} />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem"

export const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 text-[11px] font-medium text-t4", className)}
    style={{ padding: "6px 8px", fontSize: "11px", fontWeight: 500, color: "var(--color-t4)" }}
    {...props}
  />
))
DropdownMenuLabel.displayName = "DropdownMenuLabel"

export const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-bd", className)}
    style={{ margin: "4px -4px", height: "1px", backgroundColor: "var(--color-bd)" }}
    {...props}
  />
))
DropdownMenuSeparator.displayName = "DropdownMenuSeparator"
