import { APP_SIDEBAR_W, APP_TOP_BAR_H } from "@/components/app-top-bar"

/** Shown while session resolves — avoids a blank screen on first paint. */
export function AppShellSkeleton() {
  return (
    <div className="min-h-screen bg-pg">
      <aside
        className="fixed inset-y-0 left-0 border-r border-bd bg-sr flex flex-col"
        style={{ width: APP_SIDEBAR_W }}
      >
        <div className="h-14 border-b border-bd px-4 flex items-center">
          <div className="skeleton h-6 w-24 rounded" />
        </div>
        <div className="flex-1 p-3 space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="skeleton h-9 rounded-lg" />
          ))}
        </div>
      </aside>
      <header
        className="fixed top-0 right-0 border-b border-bd bg-sr flex items-center px-6 gap-4"
        style={{ left: APP_SIDEBAR_W, height: APP_TOP_BAR_H }}
      >
        <div className="skeleton h-9 flex-1 max-w-md rounded-full" />
        <div className="skeleton h-8 w-8 rounded-full" />
      </header>
      <main
        className="min-h-screen bg-pg px-8 py-8"
        style={{ marginLeft: APP_SIDEBAR_W, paddingTop: APP_TOP_BAR_H }}
      >
        <div className="skeleton h-9 w-48 rounded mb-2" />
        <div className="skeleton h-4 w-32 rounded mb-8" />
        <div className="skeleton h-64 rounded-2xl" />
      </main>
    </div>
  )
}
