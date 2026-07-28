"use client"

export function Section({
  step,
  title,
  question,
  children,
}: {
  step: number
  title: string
  question: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-pg type-badge tabular-nums text-t2">
          {step}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-t1">{title}</h3>
          <p className="mt-0.5 text-xs text-t3">{question}</p>
        </div>
      </div>
      <div className="pl-0 sm:pl-9">{children}</div>
    </section>
  )
}

export function Divider() {
  return <div className="h-px bg-bd" role="separator" />
}
