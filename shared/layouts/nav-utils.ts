export function isNavItemActive(path: string, key: string, href: string): boolean {
  if (key === "dashboard") return path === "/"
  // Hold list lives under /clients/hold-list but is its own nav item — don't
  // also light up Clients when that route (or a nested path) is active.
  if (key === "clients") {
    if (path === "/clients/hold-list" || path.startsWith("/clients/hold-list/")) return false
    return path === "/clients" || path.startsWith("/clients/")
  }
  const prefixMatch = key === "hold-list" || key === "billing" || key === "jobs" || key === "employees" || key === "password-vault" || key === "job-map" || key === "site-visit-calculator"
  return prefixMatch ? path.startsWith(href) : path === href
}

type ModuleRoute = { key: string; href: string; prefix: boolean }

const MODULE_ROUTES: ModuleRoute[] = [
  { key: "dashboard", href: "/", prefix: false },
  { key: "hold-list", href: "/clients/hold-list", prefix: false },
  { key: "clients", href: "/clients", prefix: true },
  { key: "jobs", href: "/jobs", prefix: true },
  { key: "job-map", href: "/job-map", prefix: true },
  { key: "site-visit-calculator", href: "/site-visit-calculator", prefix: true },
  { key: "quotes", href: "/quotes", prefix: true },
  { key: "calendar", href: "/calendar", prefix: true },
  { key: "employees", href: "/employees", prefix: true },
  { key: "password-vault", href: "/password-vault", prefix: true },
  { key: "billing", href: "/billing", prefix: true },
  { key: "performance", href: "/performance", prefix: true },
  { key: "archived", href: "/archived", prefix: true },
  { key: "users", href: "/users", prefix: true },
  { key: "backups", href: "/backups", prefix: true },
  { key: "health", href: "/health", prefix: true },
]

export function moduleKeyForPath(path: string): string | null {
  if (!path) return null
  for (const route of MODULE_ROUTES) {
    if (route.prefix ? path.startsWith(route.href) : path === route.href) return route.key
  }
  return null
}
