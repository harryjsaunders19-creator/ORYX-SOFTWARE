import { PageShell } from "@/components/page-layout"

export default function SiteVisitCalculatorLoading() {
  return (
    <PageShell>
      <div className="skeleton h-9 w-56 rounded mb-2" />
      <div className="skeleton h-4 w-72 rounded mb-8" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded border border-bd p-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="skeleton h-3 w-24 rounded" />
              <div className="skeleton h-10 w-full rounded" />
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded border border-bd p-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="skeleton h-4 w-32 rounded" />
              <div className="skeleton h-4 w-20 rounded" />
            </div>
          ))}
          <div className="skeleton mt-4 h-12 w-full rounded" />
        </div>
      </div>
    </PageShell>
  )
}
