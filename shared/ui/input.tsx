import * as React from "react"
import { cn } from "@/shared/utils"
import { Typography } from "@/shared/design/typography"

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, style, ...props }, ref) => {
    const hasCustomPl = className?.includes("pl-")
    const hasCustomPr = className?.includes("pr-")
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          Typography.Small,
          "flex h-9 w-full rounded-lg border border-bd bg-sr px-3.5 text-t1 transition-colors duration-150",
          "placeholder:text-t4",
          "focus:outline-none focus:ring-2 focus:ring-ac/20 focus:border-ac",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-pg",
          className,
        )}
        style={{
          height: "36px",
          width: "100%",
          borderRadius: className?.includes("rounded-full") ? "9999px" : "var(--radius-lg)",
          border: "1px solid var(--color-bd)",
          backgroundColor: "var(--color-sr)",
          ...(!hasCustomPl && { paddingLeft: "14px" }),
          ...(!hasCustomPr && { paddingRight: "14px" }),
          fontSize: "var(--type-small-size)",
          fontWeight: "var(--type-small-weight)" as unknown as number,
          lineHeight: "var(--type-small-leading)",
          color: "var(--color-t1)",
          outline: "none",
          ...style,
        }}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"
export { Input }
