import { PageShell, DataPanel } from "@/components/page-layout"

export default function QuotesLoading() {
  return (
    <PageShell wide>
      <div className="skeleton h-9 w-32 rounded mb-8" />
      <DataPanel>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-16 border-b border-bd last:border-0 px-4 flex items-center gap-4">
            <div className="skeleton h-4 w-20 rounded" />
            <div className="skeleton h-4 flex-1 max-w-[200px] rounded" />
            <div className="skeleton h-4 w-16 rounded ml-auto" />
          </div>
        ))}
      </DataPanel>
    </PageShell>
  )
}
