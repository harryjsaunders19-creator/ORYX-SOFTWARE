export function isNavItemActive(path: string, key: string, href: string): boolean {
  if (key === "dashboard") return path === "/"
  const prefixMatch = key === "hold-list" || key === "billing" || key === "clients" || key === "jobs" || key === "employees" || key === "password-vault" || key === "job-map" || key === "site-visit-calculator"
  return prefixMatch ? path.startsWith(href) : path === href
}
