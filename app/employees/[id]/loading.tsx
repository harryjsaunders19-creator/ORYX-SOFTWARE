import { PageShell, DataPanel } from "@/components/page-layout"

export default function EmployeeDetailLoading() {
  return (
    <PageShell>
      <div className="flex items-center gap-4 mb-8">
        <div className="skeleton h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <div className="skeleton h-8 w-48 rounded" />
          <div className="skeleton h-4 w-32 rounded" />
        </div>
      </div>
      <DataPanel>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-12 border-b border-bd last:border-0 px-4 flex items-center gap-4">
            <div className="skeleton h-4 w-28 rounded" />
            <div className="skeleton h-4 flex-1 max-w-sm rounded" />
          </div>
        ))}
      </DataPanel>
    </PageShell>
  )
}
