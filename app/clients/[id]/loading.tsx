import { PageShell, DataPanel } from "@/components/page-layout"

export default function ClientDetailLoading() {
  return (
    <PageShell>
      <div className="skeleton h-9 w-44 rounded mb-2" />
      <div className="skeleton h-4 w-52 rounded mb-8" />
      <DataPanel>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-12 border-b border-bd last:border-0 px-4 flex items-center">
            <div className="skeleton h-4 w-32 rounded" />
            <div className="skeleton h-4 flex-1 max-w-sm ml-auto rounded" />
          </div>
        ))}
      </DataPanel>
    </PageShell>
  )
}