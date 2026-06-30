"use client"
import { StitchAppShell } from "@/components/stitch-layout/app-shell"

export function AppShell({ children }: { children: React.ReactNode }) {
  return <StitchAppShell>{children}</StitchAppShell>
}

export { APP_SIDEBAR_W, APP_TOP_BAR_H } from "@/lib/stitch-layout"
