import type { ElementType } from "react"
import {
  LayoutDashboard,
  FolderOpen,
  Activity,
  Receipt,
  CalendarDays,
  Users as UsersIcon,
  DatabaseBackup,
  Archive,
  FileText,
  DraftingCompass,
  UsersRound,
  KeyRound,
  MapPin,
  Calculator,
  Gauge,
  Ban,
} from "lucide-react"

export const NAV_ICONS: Record<string, ElementType> = {
  dashboard: LayoutDashboard,
  clients: UsersRound,
  "hold-list": Ban,
  jobs: DraftingCompass,
  "job-map": MapPin,
  "site-visit-calculator": Calculator,
  quotes: FileText,
  calendar: CalendarDays,
  employees: UsersIcon,
  "password-vault": KeyRound,
  billing: Receipt,
  performance: Gauge,
  archived: Archive,
  users: UsersIcon,
  backups: DatabaseBackup,
  health: Activity,
}

export function navIcon(key: string): ElementType {
  return NAV_ICONS[key] ?? FolderOpen
}
