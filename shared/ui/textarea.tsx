import * as React from "react"
import { cn } from "@/shared/utils"
import { Typography } from "@/shared/design/typography"

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, style, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        Typography.Small,
        "flex w-full rounded-lg border border-bd bg-sr px-3.5 py-2.5 text-t1",
        "placeholder:text-t4 resize-none",
        "hover:border-bd-strong",
        "focus:outline-none focus:ring-2 focus:ring-ac/20 focus:border-ac",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-nested-surface",
        className,
      )}
      style={{
        width: "100%",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--color-bd)",
        backgroundColor: "var(--color-sr)",
        padding: "10px 14px",
        fontSize: "var(--type-small-size)",
        fontWeight: "var(--type-small-weight)" as unknown as number,
        lineHeight: "var(--type-small-leading)",
        color: "var(--color-t1)",
        outline: "none",
        resize: "none",
        ...style,
      }}
      {...props}
    />
  )
)
Textarea.displayName = "Textarea"
export { Textarea }
