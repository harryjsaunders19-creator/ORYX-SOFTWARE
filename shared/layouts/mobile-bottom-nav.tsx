"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { MoreHorizontal } from "lucide-react"
import { cn } from "@/shared/utils"
import { useUser } from "@/shared/providers/user-context"
import { modulesForRole, type ModuleDef } from "@/shared/auth/permissions"
import {
  isNavItemActive,
  isMoreNavActive,
  splitNavForMobile,
} from "@/shared/layouts/nav-utils"
import { navIcon } from "@/shared/layouts/nav-icons"
import { MobileMoreSheet } from "@/shared/layouts/mobile-more-sheet"
import { MOBILE_BOTTOM_NAV_H } from "@/shared/branding/stitch-layout"

function NavItem({ item, active }: { item: ModuleDef; active: boolean }) {
  const Icon = navIcon(item.key)
  const short = item.key === "dashboard" ? "Home" : item.label.split(" ")[0]

  return (
    <Link
      href={item.href}
      className={cn(
        "flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 text-[10px] font-medium leading-tight transition-colors",
        active ? "text-ac" : "text-t3 hover:text-t2",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.25 : 2} />
      <span className="truncate max-w-full">{short}</span>
    </Link>
  )
}

export function MobileBottomNav() {
  const path = usePathname()
  const { role } = useUser()
  const [moreOpen, setMoreOpen] = useState(false)

  const all = modulesForRole(role)
  const { primary, overflow } = splitNavForMobile(all)
  const moreActive = isMoreNavActive(path, overflow)

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-bd bg-sr lg:hidden"
        style={{
          height: MOBILE_BOTTOM_NAV_H,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
        aria-label="Main navigation"
      >
        <div className="mx-auto flex h-full max-w-lg items-stretch justify-around px-1">
          {primary.map(item => (
            <NavItem
              key={item.href}
              item={item}
              active={isNavItemActive(path, item.key, item.href)}
            />
          ))}
          {overflow.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={cn(
                "flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 text-[10px] font-medium leading-tight transition-colors",
                moreActive ? "text-ac" : "text-t3 hover:text-t2",
              )}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
            >
              <MoreHorizontal className="h-5 w-5 shrink-0" strokeWidth={moreActive ? 2.25 : 2} />
              <span>More</span>
            </button>
          )}
        </div>
      </nav>
      {overflow.length > 0 && (
        <MobileMoreSheet open={moreOpen} onOpenChange={setMoreOpen} items={overflow} />
      )}
    </>
  )
}
