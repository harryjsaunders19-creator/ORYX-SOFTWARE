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
  const reactId = React.useId()
  const controlId = htmlFor ?? reactId
  const errorId = error ? `${controlId}-error` : undefined
  const hintId = !error && hint ? `${controlId}-hint` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined

  const enhancedChildren = (() => {
    if (!React.isValidElement(children)) return children
    // Only wire when Field wraps a single control element (not fragments / siblings).
    if (React.Children.count(children) !== 1) return children
    const child = children as React.ReactElement<Record<string, unknown>>
    const existingDescribedBy = typeof child.props["aria-describedby"] === "string"
      ? child.props["aria-describedby"]
      : undefined
    const mergedDescribedBy = [existingDescribedBy, describedBy].filter(Boolean).join(" ") || undefined
    return React.cloneElement(child, {
      id: (typeof child.props.id === "string" && child.props.id) ? child.props.id : controlId,
      "aria-invalid": error ? true : child.props["aria-invalid"],
      ...(mergedDescribedBy ? { "aria-describedby": mergedDescribedBy } : {}),
    })
  })()

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={controlId}>
        {label}
        {required && <span className="text-dn ml-0.5">*</span>}
      </Label>
      {enhancedChildren}
      {error ? (
        <FieldError id={errorId}>{error}</FieldError>
      ) : hint ? (
        <p id={hintId} className={cn(Typography.Helper, "text-t4")}>{hint}</p>
      ) : null}
    </div>
  )
}

export function FieldError({ children, className, id }: {
  children: React.ReactNode
  className?: string
  id?: string
}) {
  return <p id={id} className={cn(Typography.Helper, "text-dn", className)}>{children}</p>
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
