"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { X } from "lucide-react"
import { cn } from "@/shared/utils"
import type { ModuleDef } from "@/shared/auth/permissions"
import { isNavItemActive } from "@/shared/layouts/nav-utils"
import { navIcon } from "@/shared/layouts/nav-icons"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: ModuleDef[]
}

export function MobileMoreSheet({ open, onOpenChange, items }: Props) {
  const path = usePathname()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        className="!fixed !left-0 !right-0 !top-auto !bottom-0 !translate-x-0 !translate-y-0 max-h-[70vh] rounded-b-none rounded-t-2xl"
      >
        <DialogHeader className="flex flex-row items-center justify-between border-b border-bd pb-3">
          <DialogTitle className="text-base">More</DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-t3 hover:bg-surface-low"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </DialogHeader>
        <nav className="overflow-y-auto thin-scroll py-2 -mx-1">
          {items.map(item => {
            const active = isNavItemActive(path, item.key, item.href)
            const Icon = navIcon(item.key)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onOpenChange(false)}
                className={cn(
                  "flex min-h-[48px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "bg-ac-bg text-ac" : "text-t1 hover:bg-surface-low",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </DialogContent>
    </Dialog>
  )
}
