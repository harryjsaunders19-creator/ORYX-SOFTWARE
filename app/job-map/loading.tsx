import { PageShell, DataPanel } from "@/components/page-layout"

export default function JobMapLoading() {
  return (
    <PageShell>
      <div className="skeleton h-9 w-40 rounded mb-2" />
      <div className="skeleton h-4 w-56 rounded mb-8" />
      <DataPanel>
        <div className="skeleton h-[420px] w-full rounded" />
      </DataPanel>
    </PageShell>
  )
}
