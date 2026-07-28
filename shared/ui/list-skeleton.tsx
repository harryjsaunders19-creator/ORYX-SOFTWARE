"use client"

/** Compact skeleton block for list / panel loading states. */
export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={className ?? "space-y-2 p-4"} aria-label="Loading" role="status">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-10 w-full rounded-lg" style={{ opacity: 1 - i * 0.08 }} />
      ))}
    </div>
  )
}
