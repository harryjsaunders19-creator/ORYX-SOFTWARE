import { redirect } from "next/navigation"

/** Legacy URL — dashboard lives at `/`. */
export default function DashboardRedirect() {
  redirect("/")
}
