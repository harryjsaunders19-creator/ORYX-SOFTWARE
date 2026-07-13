import { PageShell, DataPanel } from "@/components/page-layout"

export default function JobDetailLoading() {
  return (
    <PageShell>
      <div className="skeleton h-9 w-48 rounded mb-2" />
      <div className="skeleton h-4 w-64 rounded mb-8" />
      <DataPanel>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-12 border-b border-bd last:border-0 px-4 flex items-center">
            <div className="skeleton h-4 w-40 rounded" />
            <div className="skeleton h-4 flex-1 max-w-md ml-auto rounded" />
          </div>
        ))}
      </DataPanel>
    </PageShell>
  )
}
