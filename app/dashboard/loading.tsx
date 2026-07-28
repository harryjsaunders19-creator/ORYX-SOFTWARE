import { PageShell } from "@/components/page-layout"

export default function DashboardLoading() {
  return (
    <PageShell>
      <div className="space-y-8">
        <div className="flex justify-between gap-4">
          <div className="space-y-2">
            <div className="skeleton h-8 w-64 rounded-lg" />
            <div className="skeleton h-4 w-48 rounded-lg" />
          </div>
          <div className="skeleton h-9 w-20 rounded-lg" />
        </div>
        <div className="skeleton h-14 w-full rounded-xl" />
        <div className="grid grid-cols-12 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="col-span-6 skeleton h-36 rounded-xl lg:col-span-3" />
          ))}
        </div>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 skeleton h-56 rounded-xl lg:col-span-6" />
          <div className="col-span-12 skeleton h-56 rounded-xl lg:col-span-6" />
        </div>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 skeleton h-56 rounded-xl lg:col-span-6" />
          <div className="col-span-12 skeleton h-56 rounded-xl lg:col-span-6" />
        </div>
      </div>
    </PageShell>
  )
}
