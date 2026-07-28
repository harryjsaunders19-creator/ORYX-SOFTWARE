import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cn } from "@/shared/utils"
import { Typography } from "@/shared/design/typography"

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(Typography.Label, "text-t2 select-none", className)}
    style={{
      fontSize: "var(--type-label-size)",
      fontWeight: "var(--type-label-weight)" as unknown as number,
      lineHeight: "var(--type-label-leading)",
      color: "var(--color-t2)",
      userSelect: "none",
      display: "block",
      marginBottom: "0",
    }}
    {...props}
  />
))
Label.displayName = "Label"
export { Label }
