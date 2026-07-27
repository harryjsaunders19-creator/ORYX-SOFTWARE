import { PageShell, DataPanel } from "@/components/page-layout"

export default function ArchivedLoading() {
  return (
    <PageShell>
      <div className="skeleton h-9 w-44 rounded mb-2" />
      <div className="skeleton h-4 w-56 rounded mb-8" />
      <DataPanel>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-12 border-b border-bd last:border-0 px-4 flex items-center gap-4">
            <div className="skeleton h-4 w-24 rounded" />
            <div className="skeleton h-4 flex-1 max-w-xs rounded" />
            <div className="skeleton h-4 w-20 rounded" />
          </div>
        ))}
      </DataPanel>
    </PageShell>
  )
}
