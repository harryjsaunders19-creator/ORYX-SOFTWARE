"use client"

import { useRouter } from "next/navigation"
import { isExperimentalEnabled } from "@/lib/experimental-features"
import { LogOut, User } from "lucide-react"
import { useUser } from "@/components/user-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function UserProfileMenu() {
  const router = useRouter()
  const { user, logout } = useUser()

  const initials = user?.name
    ?.split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join("") ?? "?"

  const handleLogout = async () => {
    await logout()
    window.location.href = "/login"
  }

  if (!user) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-bd bg-surface-low text-[11px] font-bold text-t1 transition-colors hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ac/30"
          aria-label="Account menu"
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="normal-case tracking-normal font-medium text-t1">
          {user.name}
        </DropdownMenuLabel>
        {user.email && (
          <p className="px-2 pb-1.5 text-xs text-t3 truncate">{user.email}</p>
        )}
        <DropdownMenuSeparator />
        {isExperimentalEnabled("employees") && (
          <DropdownMenuItem onSelect={() => router.push(`/employees/${user.id}`)}>
            <User className="h-4 w-4 shrink-0 text-t3" />
            My profile
          </DropdownMenuItem>
        )}
        {isExperimentalEnabled("employees") && <DropdownMenuSeparator />}
        <DropdownMenuItem danger onSelect={handleLogout}>
          <LogOut className="h-4 w-4 shrink-0" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
