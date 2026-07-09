import { JobMapPageShell } from "@/modules/job-map/components/job-map-page-shell"

export const metadata = { title: "Job Map" }
export const dynamic = "force-dynamic"

export default function Page() {
  return <JobMapPageShell />
}
