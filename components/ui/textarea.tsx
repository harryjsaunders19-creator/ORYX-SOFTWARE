import * as React from "react"
import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, style, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex w-full rounded-lg border border-bd bg-sr px-3.5 py-2.5 text-sm text-t1",
        "placeholder:text-t4 resize-none",
        "focus:outline-none focus:ring-2 focus:ring-ac/20 focus:border-ac",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      style={{
        width: "100%",
        borderRadius: "8px",
        border: "1px solid var(--color-bd)",
        backgroundColor: "var(--color-sr)",
        padding: "10px 14px",
        fontSize: "14px",
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
