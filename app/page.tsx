import { DashboardStats } from "@/components/dashboard-stats"

export default function DashboardPage() {
  return (
    <div className="px-6 py-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-t1">Dashboard</h1>
        <p className="text-sm text-t3 mt-0.5">What needs attention today</p>
      </div>
      <DashboardStats />
    </div>
  )
}
