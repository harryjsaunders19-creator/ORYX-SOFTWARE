import { PageShell, DataPanel } from "@/components/page-layout"

export default function BackupsLoading() {
  return (
    <PageShell>
      <div className="skeleton h-9 w-36 rounded mb-8" />
      <DataPanel>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-14 border-b border-bd last:border-0 px-4 flex items-center">
            <div className="skeleton h-4 w-52 rounded" />
          </div>
        ))}
      </DataPanel>
    </PageShell>
  )
}
