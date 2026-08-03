"use client"
import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/shared/utils"
import { Typography } from "@/shared/design/typography"

export const Select      = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value
export const SelectGroup = SelectPrimitive.Group

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      Typography.Small,
      "flex h-9 w-full items-center justify-between rounded-lg border border-bd bg-sr",
      "px-3.5 text-t1 transition-colors duration-150",
      "hover:border-bd-strong",
      "focus:outline-none focus:ring-2 focus:ring-ac/20 focus:border-ac",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[placeholder]:text-t4",
      className,
    )}
    style={{
      height: "36px",
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderRadius: "var(--radius-lg)",
      border: "1px solid var(--color-bd)",
      backgroundColor: "var(--color-sr)",
      paddingLeft: "14px",
      paddingRight: "14px",
      fontSize: "var(--type-small-size)",
      fontWeight: "var(--type-small-weight)" as unknown as number,
      lineHeight: "var(--type-small-leading)",
      color: "var(--color-t1)",
      outline: "none",
      cursor: "default",
    }}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-3.5 w-3.5 text-t4 shrink-0 ml-1" style={{ color: "var(--color-t4)", flexShrink: 0, marginLeft: "4px" }} />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = "SelectTrigger"

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      className={cn(
        "relative z-[200] max-h-72 overflow-hidden",
        "rounded-xl border border-bd bg-sr shadow-card",
        position === "popper" && "translate-y-1",
        className,
      )}
      style={{
        zIndex: 200,
        maxHeight: "288px",
        overflow: "hidden",
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--color-bd)",
        backgroundColor: "var(--color-sr)",
        boxShadow: "var(--shadow-modal)",
      }}
      {...props}
    >
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" && "w-full min-w-[var(--radix-select-trigger-width)]",
        )}
        style={{ padding: "4px" }}
      >
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = "SelectContent"

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      Typography.Small,
      "relative flex w-full cursor-default select-none items-center",
      "rounded-md py-2 pl-7 pr-2.5 text-t1",
      "focus:bg-hover-surface outline-none",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    style={{
      padding: "8px 10px 8px 28px",
      fontSize: "var(--type-small-size)",
      fontWeight: "var(--type-small-weight)" as unknown as number,
      lineHeight: "var(--type-small-leading)",
      color: "var(--color-t1)",
      borderRadius: "var(--radius-md)",
      position: "relative",
      cursor: "default",
    }}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center" style={{ position: "absolute", left: "8px", display: "flex", alignItems: "center" }}>
      <SelectPrimitive.ItemIndicator>
        <Check className="h-3.5 w-3.5 text-ac" style={{ color: "var(--color-ac)" }} />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = "SelectItem"

export const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-bd", className)}
    style={{ margin: "4px -4px", height: "1px", backgroundColor: "var(--color-bd)" }}
    {...props}
  />
))
SelectSeparator.displayName = "SelectSeparator"
