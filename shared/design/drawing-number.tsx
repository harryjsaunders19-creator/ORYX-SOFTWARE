import type { ElementType, ReactNode } from "react"
import { cn } from "@/shared/utils"
import { Typography } from "@/shared/design/typography"

type DrawingNumberProps = {
  children: ReactNode
  className?: string
  /** Element to render — default `span`. */
  as?: ElementType
}

/**
 * Drawing numbers / job identifiers — always Inter, always bold, never italic.
 * Size inherits from parent or an accompanying Typography size class.
 */
export function DrawingNumber({
  children,
  className,
  as: Comp = "span",
}: DrawingNumberProps) {
  return (
    <Comp className={cn(Typography.DrawingNumber, className)}>
      {children}
    </Comp>
  )
}
