import type { ElementType } from "react"
import {
  LayoutDashboard, FolderOpen, Activity, Receipt, CalendarDays,
  Building2, AlertTriangle, FileText, Users as UsersIcon, DatabaseBackup, Archive,
  GitBranch, UsersRound, KeyRound, MapPin,
} from "lucide-react"

export const NAV_ICONS: Record<string, ElementType> = {
  dashboard: LayoutDashboard,
  clients: Building2,
  "hold-list": AlertTriangle,
  jobs: GitBranch,
  "job-map": MapPin,
  quotes: FileText,
  calendar: CalendarDays,
  employees: UsersRound,
  "password-vault": KeyRound,
  billing: Receipt,
  archived: Archive,
  users: UsersIcon,
  backups: DatabaseBackup,
  health: Activity,
}

export function navIcon(key: string): ElementType {
  return NAV_ICONS[key] ?? FolderOpen
}
