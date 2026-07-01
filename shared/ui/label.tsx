import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cn } from "@/shared/utils"

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn("text-xs font-medium text-t2 select-none", className)}
    style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-t2)", userSelect: "none", display: "block", marginBottom: "0" }}
    {...props}
  />
))
Label.displayName = "Label"
export { Label }
