"use client"

import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/shared/ui/dropdown-menu"
import { useUser } from "@/shared/providers/user-context"

export function QuickCreateMenu() {
  const router = useRouter()
  const { canAccess } = useUser()

  const items = [
    canAccess("jobs") && { label: "New job", href: "/jobs?new=1" },
    canAccess("quotes") && { label: "New quote", href: "/quotes?new=1" },
    canAccess("clients") && { label: "New client", href: "/clients?new=1" },
    canAccess("calendar") && { label: "Book site visit", href: "/calendar?new=site-visit" },
  ].filter(Boolean) as { label: string; href: string }[]

  if (!items.length) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="primary" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {items.map((item, i) => (
          <div key={item.href}>
            {i === 3 && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={() => router.push(item.href)}>
              {item.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
