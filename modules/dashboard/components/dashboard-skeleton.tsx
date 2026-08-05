/** Shared dashboard loading skeleton — used by Suspense fallback and client isLoading. */
export function DashboardSkeleton() {
  return (
    <div className="cc-dashboard space-y-6">
      <div className="h-12 max-w-md rounded-lg skeleton" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-[104px] rounded-xl skeleton" />
        ))}
      </div>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 h-56 rounded-xl skeleton lg:col-span-8" />
        <div className="col-span-12 h-56 rounded-xl skeleton lg:col-span-4" />
      </div>
    </div>
  )
}
