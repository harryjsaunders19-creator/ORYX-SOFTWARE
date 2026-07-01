"use client"
import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { format } from "date-fns"
import { ChevronLeft, ChevronRight, UsersRound } from "lucide-react"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import { useApi } from "@/shared/hooks/use-api"
import {
  PageHeader, PageShell, SearchField, DataPanel, EmptyPanel, Th, TableHead, TableShell,
} from "@/shared/layouts/page-layout"
import { cn } from "@/shared/utils"
import type { EmployeeListItem } from "../services/employee-service"

const LIMIT = 50

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  ON_LEAVE: "On Leave",
  SUSPENDED: "Suspended",
  FORMER: "Former",
}

type EmployeesData = {
  employees: EmployeeListItem[]
  total: number
  page?: number
  limit?: number
  departments: string[]
}

function EmployeeAvatar({ userId, name }: { userId: string; name: string }) {
  const [failed, setFailed] = useState(false)
  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("")
  if (failed) {
    return (
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-low text-xs font-bold text-t2">
        {initials || "?"}
      </div>
    )
  }
  return (
    <Image
      src={`/api/employees/${userId}/photo`}
      alt=""
      width={36}
      height={36}
      unoptimized
      className="size-9 shrink-0 rounded-full border border-bd object-cover bg-surface-low"
      onError={() => setFailed(true)}
    />
  )
}

function EmployeesInner() {
  const [search, setSearch] = useState("")
  const [department, setDepartment] = useState("")
  const [status, setStatus] = useState("")
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebouncedValue(search, 280)

  useEffect(() => { setPage(1) }, [debouncedSearch, department, status])

  const apiKey = `/api/employees?${new URLSearchParams({
    search: debouncedSearch,
    page: String(page),
    limit: String(LIMIT),
    ...(department && { department }),
    ...(status && { status }),
  })}`

  const { data, error, isLoading } = useApi<EmployeesData>(apiKey)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1

  return (
    <PageShell>
      <PageHeader
        title="Employees"
        description="Company directory — search, filter, and open employee profiles."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchField value={search} onChange={setSearch} placeholder="Search name, email, job title…" />
        <select
          value={department}
          onChange={e => setDepartment(e.target.value)}
          className="h-10 rounded border border-bd bg-sr px-3 text-sm text-t1"
        >
          <option value="">All departments</option>
          {(data?.departments ?? []).map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="h-10 rounded border border-bd bg-sr px-3 text-sm text-t1"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded border border-dn-bd bg-dn-bg p-3 text-sm text-dn-tx">{error.message}</div>
      )}

      <DataPanel noPadding>
        {isLoading && !data ? (
          <div className="space-y-2 p-4">
            {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-12 rounded" />)}
          </div>
        ) : !data?.employees.length ? (
          <EmptyPanel icon={UsersRound} title="No employees found" description="Try adjusting your search or filters." />
        ) : (
          <>
            <TableShell>
              <table className="w-full min-w-[720px] text-sm">
                <TableHead>
                  <Th className="w-12" />
                  <Th>Name</Th>
                  <Th>Job Title</Th>
                  <Th>Department</Th>
                  <Th>Email</Th>
                  <Th>Phone</Th>
                  <Th>Status</Th>
                  <Th>Start Date</Th>
                </TableHead>
                <tbody>
                  {data.employees.map(emp => (
                    <tr key={emp.userId} className="border-b border-bd last:border-0 hover:bg-pg">
                      <td className="px-4 py-3">
                        <EmployeeAvatar userId={emp.userId} name={emp.name} />
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/employees/${emp.userId}`} className="font-medium text-t1 hover:text-ac">
                          {emp.name}
                        </Link>
                        {emp.employeeId && (
                          <p className="font-mono text-[10px] text-t4 mt-0.5">{emp.employeeId}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-t3">{emp.jobTitle ?? "—"}</td>
                      <td className="px-4 py-3 text-t3">{emp.department ?? "—"}</td>
                      <td className="px-4 py-3 text-t3">{emp.email ?? "—"}</td>
                      <td className="px-4 py-3 text-t3">{emp.phone ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                          emp.employmentStatus === "ACTIVE" && "bg-ok-bg text-ok-tx",
                          emp.employmentStatus === "ON_LEAVE" && "bg-wn-bg text-wn-tx",
                          emp.employmentStatus === "SUSPENDED" && "bg-dn-bg text-dn-tx",
                          emp.employmentStatus === "FORMER" && "bg-gy-bg text-gy-tx",
                        )}>
                          {STATUS_LABELS[emp.employmentStatus] ?? emp.employmentStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-t3 tabular-nums whitespace-nowrap">
                        {emp.startDate ? format(new Date(emp.startDate), "d MMM yyyy") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
            <div className="flex items-center justify-between border-t border-bd px-4 py-3 text-xs text-t3">
              <span>{data.total} employee{data.total !== 1 ? "s" : ""}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="rounded p-1 hover:bg-pg disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span>Page {page} of {totalPages}</span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="rounded p-1 hover:bg-pg disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </DataPanel>
    </PageShell>
  )
}

export default function EmployeeDirectoryPage() {
  return (
    <Suspense>
      <EmployeesInner />
    </Suspense>
  )
}
