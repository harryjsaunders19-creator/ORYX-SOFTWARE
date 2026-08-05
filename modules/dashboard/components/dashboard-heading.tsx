"use client"

import { useEffect, useState } from "react"
import { cn } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

function firstName(fullName: string): string {
  const part = fullName.trim().split(/\s+/).filter(Boolean)[0]
  return part || "there"
}

function joinParts(parts: string[]): string {
  if (parts.length === 0) return ""
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`
}

function buildOperationalSummary(opts: {
  overdueCount: number
  checking: number
  dueWeek: number
  invoicing: number | null
  isAdmin: boolean
}): string | null {
  const parts: string[] = []
  if (opts.overdueCount > 0) {
    parts.push(
      `${opts.overdueCount} overdue job${opts.overdueCount === 1 ? "" : "s"}`,
    )
  }
  if (opts.checking > 0) {
    parts.push(
      `${opts.checking} item${opts.checking === 1 ? "" : "s"} requiring a check`,
    )
  }
  if (opts.dueWeek > 0 && opts.overdueCount === 0) {
    parts.push(
      `${opts.dueWeek} job${opts.dueWeek === 1 ? "" : "s"} due this week`,
    )
  }
  if (opts.isAdmin && (opts.invoicing ?? 0) > 0) {
    parts.push(
      `${opts.invoicing} job${opts.invoicing === 1 ? "" : "s"} ready to invoice`,
    )
  }
  if (parts.length === 0) {
    return "No urgent items — operations are on track."
  }
  return `You have ${joinParts(parts)}.`
}

export function DashboardHeading({
  userName,
  overdueCount,
  checking,
  dueWeek,
  invoicing,
  isAdmin,
}: {
  userName: string
  overdueCount: number
  checking: number
  dueWeek: number
  invoicing: number | null
  isAdmin: boolean
}) {
  // Avoid SSR/client hour mismatch — greet neutrally until mounted.
  const [hour, setHour] = useState<number | null>(null)
  useEffect(() => {
    setHour(new Date().getHours())
  }, [])

  const greeting = hour == null ? "Hello" : greetingForHour(hour)
  const name = firstName(userName)
  const summary = buildOperationalSummary({
    overdueCount,
    checking,
    dueWeek,
    invoicing,
    isAdmin,
  })

  return (
    <header className="mb-4">
      <h1 className={cn(Typography.PageTitle, "text-t1")}>
        {greeting}, {name}
      </h1>
      {summary && (
        <p className={cn(Typography.Small, "mt-1 max-w-2xl text-t2")}>
          {summary}
        </p>
      )}
    </header>
  )
}
