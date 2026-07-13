import { PageShell } from "@/components/page-layout"

export default function CalendarLoading() {
  return (
    <PageShell wide>
      <div className="skeleton h-9 w-36 rounded mb-8" />
      <div className="skeleton h-[28rem] w-full rounded" />
    </PageShell>
  )
}
