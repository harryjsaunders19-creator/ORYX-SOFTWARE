/** Sidebar nav grouping for the ORYX OS shell. */
export const NAV_GROUPS = [
  {
    id: "work",
    label: "Work",
    keys: [
      "dashboard",
      "clients",
      "hold-list",
      "jobs",
      "site-visit-calculator",
      "quotes",
      "calendar",
      "employees",
    ],
  },
  {
    id: "finance",
    label: "Finance",
    keys: ["billing", "performance", "job-map"],
  },
  {
    id: "administration",
    label: "Administration",
    keys: ["password-vault", "archived", "users", "backups", "health"],
  },
] as const

export type NavGroupId = (typeof NAV_GROUPS)[number]["id"]
