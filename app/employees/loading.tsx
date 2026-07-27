import { PageShell, DataPanel } from "@/components/page-layout"

export default function EmployeesLoading() {
  return (
    <PageShell>
      <div className="skeleton h-9 w-40 rounded mb-2" />
      <div className="skeleton h-4 w-48 rounded mb-8" />
      <DataPanel>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-14 border-b border-bd last:border-0 px-4 flex items-center gap-4">
            <div className="skeleton h-8 w-8 rounded-full" />
            <div className="skeleton h-4 w-40 rounded" />
            <div className="skeleton h-4 flex-1 max-w-xs rounded" />
          </div>
        ))}
      </DataPanel>
    </PageShell>
  )
}
