import * as React from "react"
import { cn } from "@/shared/utils"
import { Label } from "@/shared/ui/label"
import { Typography } from "@/shared/design/typography"

/** Standard form field — label, control, error or hint on the 8px grid. */
export function Field({
  label,
  required,
  error,
  hint,
  htmlFor,
  className,
  children,
}: {
  label: string
  required?: boolean
  error?: string | null
  hint?: string
  htmlFor?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-dn ml-0.5">*</span>}
      </Label>
      {children}
      {error ? <FieldError>{error}</FieldError> : hint ? (
        <p className={cn(Typography.Helper, "text-t4")}>{hint}</p>
      ) : null}
    </div>
  )
}

export function FieldError({ children, className }: {
  children: React.ReactNode
  className?: string
}) {
  return <p className={cn(Typography.Helper, "text-dn", className)}>{children}</p>
}

/** Form-level error / alert banner. */
export function FormAlert({ children, className }: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn(
      Typography.Small,
      "rounded-md border border-dn-bd bg-dn-bg p-3 font-medium text-dn-tx",
      className,
    )}>
      {children}
    </div>
  )
}
