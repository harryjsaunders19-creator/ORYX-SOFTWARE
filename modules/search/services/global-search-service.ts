import { format, subYears, addYears } from "date-fns"
import { jobService } from "@/modules/jobs"
import { clientService } from "@/modules/clients"
import { quoteService } from "@/modules/quotes"
import { billingHandoffService } from "@/modules/billing"
import { userService } from "@/modules/users"
import { calendarService } from "@/modules/calendar"
import { employeeService } from "@/modules/employees"
import { canAccessModule } from "@/shared/auth/permissions"
import { formatGBP } from "@/shared/utils/utils"
import { bestScore, SEARCH_WEIGHTS } from "../rank"
import type {
  GlobalSearchOptions,
  GlobalSearchResult,
  SearchEntityType,
  SearchGroup,
  SearchHit,
} from "../types"

const PER_TYPE = {
  job: 8,
  revision: 6,
  client: 6,
  quote: 6,
  invoice: 5,
  user: 5,
  calendar: 5,
  employee: 5,
} as const

const GROUP_ORDER: SearchEntityType[] = [
  "job",
  "revision",
  "client",
  "quote",
  "invoice",
  "calendar",
  "employee",
  "user",
]

const GROUP_LABEL: Record<SearchEntityType, string> = {
  job: "Jobs",
  revision: "Revisions",
  client: "Clients",
  quote: "Quotes",
  invoice: "Invoices",
  calendar: "Calendar",
  employee: "Employees",
  user: "Users",
}

function statusLabel(status: string | null | undefined): string {
  if (!status) return ""
  return status
    .toLowerCase()
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function takeTop(hits: SearchHit[], n: number): SearchHit[] {
  return hits
    .filter(h => h.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, n)
}

async function searchJobs(query: string): Promise<SearchHit[]> {
  const rows = await jobService.findMany({
    where: { search: query, onlyOriginals: true },
    take: PER_TYPE.job * 2,
  })
  return takeTop(
    rows.map(row => {
      const tagsJoined = (row.tags ?? []).join(", ")
      const score = bestScore(query, [
        { value: row.drawingNumber, weight: SEARCH_WEIGHTS.number },
        { value: row.quoteReference, weight: SEARCH_WEIGHTS.number },
        { value: row.clientCompany, weight: SEARCH_WEIGHTS.clientName },
        { value: row.typeOfWorks, weight: SEARCH_WEIGHTS.project },
        { value: row.customTypeDescription, weight: SEARCH_WEIGHTS.project },
        { value: tagsJoined, weight: SEARCH_WEIGHTS.project },
        ...(row.tags ?? []).map(tag => ({ value: tag, weight: SEARCH_WEIGHTS.project })),
        { value: row.address, weight: SEARCH_WEIGHTS.address },
        { value: row.designer, weight: SEARCH_WEIGHTS.person },
        { value: row.requestedBy, weight: SEARCH_WEIGHTS.person },
      ])
      const matchedTags = (row.tags ?? []).filter(tag =>
        tag.toLowerCase().includes(query.trim().toLowerCase())
        || query.trim().toLowerCase().includes(tag.toLowerCase()),
      )
      return {
        id: row.id,
        type: "job" as const,
        title: row.drawingNumber,
        subtitle: [row.clientCompany, row.address, matchedTags.join(", ") || undefined]
          .filter(Boolean)
          .join(" · "),
        href: `/jobs/${row.id}`,
        meta: statusLabel(row.status),
        score,
      }
    }),
    PER_TYPE.job,
  )
}

async function searchRevisions(query: string): Promise<SearchHit[]> {
  const rows = await jobService.findMany({
    where: { search: query, onlyRevisions: true },
    take: PER_TYPE.revision * 2,
  })
  return takeTop(
    rows.map(row => {
      const rev = row.revisionLetter ? `Rev ${row.revisionLetter}` : "Revision"
      const tagsJoined = (row.tags ?? []).join(", ")
      const score = bestScore(query, [
        { value: row.drawingNumber, weight: SEARCH_WEIGHTS.number },
        { value: row.revisionLetter, weight: SEARCH_WEIGHTS.number },
        { value: row.clientCompany, weight: SEARCH_WEIGHTS.clientName },
        { value: tagsJoined, weight: SEARCH_WEIGHTS.project },
        ...(row.tags ?? []).map(tag => ({ value: tag, weight: SEARCH_WEIGHTS.project })),
        { value: row.address, weight: SEARCH_WEIGHTS.address },
        { value: row.designer, weight: SEARCH_WEIGHTS.person },
      ])
      return {
        id: row.id,
        type: "revision" as const,
        title: row.drawingNumber,
        subtitle: [rev, row.clientCompany, row.designer].filter(Boolean).join(" · "),
        href: `/jobs/${row.parentJobId ?? row.id}`,
        meta: statusLabel(row.status),
        score,
      }
    }),
    PER_TYPE.revision,
  )
}

async function searchClients(query: string): Promise<SearchHit[]> {
  const rows = await clientService.findMany({
    search: query,
    activeOnly: true,
    take: PER_TYPE.client * 2,
  })
  return takeTop(
    rows.map(row => {
      const score = bestScore(query, [
        { value: row.name, weight: SEARCH_WEIGHTS.clientName },
        { value: row.accountCode, weight: SEARCH_WEIGHTS.exactId },
        { value: row.contactName, weight: SEARCH_WEIGHTS.person },
        { value: row.email, weight: SEARCH_WEIGHTS.other },
        { value: row.phone, weight: SEARCH_WEIGHTS.other },
      ])
      return {
        id: row.id,
        type: "client" as const,
        title: row.name,
        subtitle: [row.contactName, row.email, row.phone].filter(Boolean).join(" · "),
        href: `/clients/${row.id}`,
        meta: row.accountCode ?? undefined,
        score,
      }
    }),
    PER_TYPE.client,
  )
}

async function searchQuotes(query: string): Promise<SearchHit[]> {
  const rows = await quoteService.findMany({
    search: query,
    take: PER_TYPE.quote * 2,
  })
  return takeTop(
    rows.map(row => {
      const score = bestScore(query, [
        { value: row.quoteNumber, weight: SEARCH_WEIGHTS.number },
        { value: row.clientCompany, weight: SEARCH_WEIGHTS.clientName },
        { value: row.address, weight: SEARCH_WEIGHTS.address },
        { value: row.description, weight: SEARCH_WEIGHTS.project },
        { value: row.status, weight: SEARCH_WEIGHTS.other },
      ])
      return {
        id: row.id,
        type: "quote" as const,
        title: row.quoteNumber,
        subtitle: [row.clientCompany, row.address].filter(Boolean).join(" · "),
        href: `/quotes?search=${encodeURIComponent(row.quoteNumber)}`,
        meta: statusLabel(row.status),
        score,
      }
    }),
    PER_TYPE.quote,
  )
}

async function searchInvoices(query: string): Promise<SearchHit[]> {
  const rows = await billingHandoffService.findMany({
    search: query,
    cleared: false,
    take: PER_TYPE.invoice * 2,
  })
  return takeTop(
    rows.map(row => {
      const score = bestScore(query, [
        { value: row.drawingNumber, weight: SEARCH_WEIGHTS.number },
        { value: row.quoteReference, weight: SEARCH_WEIGHTS.number },
        { value: row.clientCompany, weight: SEARCH_WEIGHTS.clientName },
        { value: row.address, weight: SEARCH_WEIGHTS.address },
        { value: row.designer, weight: SEARCH_WEIGHTS.person },
      ])
      const amount = formatGBP(row.quoteValue)
      return {
        id: row.id,
        type: "invoice" as const,
        title: row.drawingNumber,
        subtitle: [row.clientCompany, amount].filter(Boolean).join(" · "),
        href: `/jobs/${row.sourceJobId}`,
        meta: row.clearedByAccountsAt ? "Cleared" : "Ready for invoicing",
        score,
      }
    }),
    PER_TYPE.invoice,
  )
}

async function searchUsers(query: string): Promise<SearchHit[]> {
  const rows = await userService.findMany({ activeOnly: true })
  const needle = query.trim().toLowerCase()
  const matched = rows.filter(row => {
    const name = row.name?.toLowerCase() ?? ""
    const email = row.email?.toLowerCase() ?? ""
    const emailLower = row.emailLower ?? ""
    return name.includes(needle) || email.includes(needle) || emailLower.includes(needle)
  })
  return takeTop(
    matched.map(row => {
      const score = bestScore(query, [
        { value: row.name, weight: SEARCH_WEIGHTS.person },
        { value: row.email, weight: SEARCH_WEIGHTS.other },
      ])
      return {
        id: row.id,
        type: "user" as const,
        title: row.name,
        subtitle: row.email ?? "",
        href: `/users`,
        meta: row.role,
        score,
      }
    }),
    PER_TYPE.user,
  )
}

async function searchCalendar(query: string): Promise<SearchHit[]> {
  const now = new Date()
  const from = format(subYears(now, 1), "yyyy-MM-dd")
  const to = format(addYears(now, 1), "yyyy-MM-dd")
  const rows = await calendarService.findMany({ from, to })
  return takeTop(
    rows.map(row => {
      const score = bestScore(query, [
        { value: row.title, weight: SEARCH_WEIGHTS.project },
        { value: row.location, weight: SEARCH_WEIGHTS.address },
        { value: row.description, weight: SEARCH_WEIGHTS.other },
        { value: row.jobDrawingNumber, weight: SEARCH_WEIGHTS.number },
        { value: row.clientName, weight: SEARCH_WEIGHTS.clientName },
        { value: row.categoryName, weight: SEARCH_WEIGHTS.other },
      ])
      const when = row.startDate.slice(0, 10)
      return {
        id: row.id,
        type: "calendar" as const,
        title: row.title,
        subtitle: [when, row.location, row.jobDrawingNumber].filter(Boolean).join(" · "),
        href: `/calendar`,
        meta: row.categoryName || undefined,
        score,
      }
    }),
    PER_TYPE.calendar,
  )
}

async function searchEmployees(
  query: string,
  viewer: NonNullable<GlobalSearchOptions["viewer"]>,
): Promise<SearchHit[]> {
  const { employees } = await employeeService.findMany(viewer, {
    search: query,
    limit: PER_TYPE.employee * 2,
  })
  return takeTop(
    employees.map(row => {
      const score = bestScore(query, [
        { value: row.name, weight: SEARCH_WEIGHTS.person },
        { value: row.email, weight: SEARCH_WEIGHTS.other },
        { value: row.jobTitle, weight: SEARCH_WEIGHTS.project },
        { value: row.department, weight: SEARCH_WEIGHTS.other },
        { value: row.employeeId, weight: SEARCH_WEIGHTS.exactId },
      ])
      return {
        id: row.userId,
        type: "employee" as const,
        title: row.name,
        subtitle: [row.jobTitle, row.department, row.email].filter(Boolean).join(" · "),
        href: `/employees/${row.userId}`,
        meta: row.employmentStatus || undefined,
        score,
      }
    }),
    PER_TYPE.employee,
  )
}

export async function runGlobalSearch(opts: GlobalSearchOptions): Promise<GlobalSearchResult> {
  const started = Date.now()
  const query = opts.query.trim()
  const limit = Math.min(Math.max(opts.limit ?? 24, 1), 30)

  if (query.length < 2) {
    return { query, groups: [], total: 0, tookMs: Date.now() - started }
  }

  const tasks: Array<Promise<SearchHit[]>> = []
  if (canAccessModule(opts.role, "jobs")) {
    tasks.push(searchJobs(query), searchRevisions(query))
  }
  if (canAccessModule(opts.role, "clients")) {
    tasks.push(searchClients(query))
  }
  if (canAccessModule(opts.role, "quotes")) {
    tasks.push(searchQuotes(query))
  }
  if (canAccessModule(opts.role, "billing")) {
    tasks.push(searchInvoices(query))
  }
  if (canAccessModule(opts.role, "calendar")) {
    tasks.push(searchCalendar(query))
  }
  if (canAccessModule(opts.role, "employees") && opts.viewer) {
    tasks.push(searchEmployees(query, opts.viewer))
  }
  if (canAccessModule(opts.role, "users")) {
    tasks.push(searchUsers(query))
  }

  const settled = await Promise.allSettled(tasks)
  const allHits: SearchHit[] = []
  for (const result of settled) {
    if (result.status === "fulfilled") allHits.push(...result.value)
  }

  const byType = new Map<SearchEntityType, SearchHit[]>()
  for (const hit of allHits) {
    const list = byType.get(hit.type) ?? []
    list.push(hit)
    byType.set(hit.type, list)
  }

  const groups: SearchGroup[] = []
  let remaining = limit
  for (const type of GROUP_ORDER) {
    if (remaining <= 0) break
    const items = (byType.get(type) ?? []).slice(0, remaining)
    if (!items.length) continue
    groups.push({ type, label: GROUP_LABEL[type], items })
    remaining -= items.length
  }

  return {
    query,
    groups,
    total: groups.reduce((n, g) => n + g.items.length, 0),
    tookMs: Date.now() - started,
  }
}
