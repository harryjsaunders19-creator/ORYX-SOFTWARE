"use client"

import { Monitor, Moon, Settings, Sun } from "lucide-react"
import { cn } from "@/shared/utils"
import { useTheme } from "@/shared/providers/theme-provider"
import type { ThemePreference } from "@/shared/theme/theme-utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/shared/ui/dropdown-menu"

const OPTIONS: { value: ThemePreference; label: string; icon: React.ElementType }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

export function SettingsMenu() {
  const { preference, setThemePreference } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded p-2 text-t3 transition-colors hover:bg-surface-low hover:text-t1 data-[state=open]:bg-surface-low data-[state=open]:text-t1"
          aria-label="Settings"
        >
          <Settings className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-3">
        <DropdownMenuLabel className="px-0 pb-2 pt-0 normal-case tracking-normal text-t2">
          Theme
        </DropdownMenuLabel>
        <div
          className="grid grid-cols-3 gap-1 rounded-lg bg-surface-low p-1"
          role="group"
          aria-label="Theme"
        >
          {OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = preference === value
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => setThemePreference(value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md px-2 py-2 text-[11px] font-medium transition-colors",
                  active
                    ? "bg-sr text-t1 shadow-sm"
                    : "text-t3 hover:text-t2",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={active ? 2.25 : 2} />
                {label}
              </button>
            )
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
