import { PageShell, DataPanel } from "@/components/page-layout"

export default function DashboardLoading() {
  return (
    <PageShell>
      <div className="skeleton h-9 w-40 rounded mb-2" />
      <div className="skeleton h-4 w-56 rounded mb-8" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-24 rounded" />
        ))}
      </div>
      <DataPanel>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 border-b border-bd last:border-0 px-4 flex items-center gap-4">
            <div className="skeleton h-4 w-28 rounded" />
            <div className="skeleton h-4 flex-1 max-w-sm rounded" />
          </div>
        ))}
      </DataPanel>
    </PageShell>
  )
}
