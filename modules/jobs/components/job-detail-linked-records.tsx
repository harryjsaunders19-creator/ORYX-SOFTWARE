"use client"
import { useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { FileText, Folder, Building2, Receipt } from "lucide-react"
import { cn } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import type { Job } from "@/lib/types"
import { invoiceLabel } from "./parent-job-helpers"

export function JobDetailLinkedRecords({
  job,
  onOpenDocuments,
}: {
  job: Job & { currentRevision?: Job | null }
  onOpenDocuments: () => void
}) {
  const router = useRouter()
  const quoteRef = job.currentQuote?.quoteNumber ?? job.quoteReference
  const invoice = invoiceLabel(job.currentRevision?.billingStatus ?? job.billingStatus ?? "")

  const rows: Array<{
    id: string
    label: string
    icon: ReactNode
    value: ReactNode
  }> = [
    {
      id: "quote",
      label: "Quote",
      icon: <FileText className="h-3.5 w-3.5" aria-hidden />,
      value: quoteRef ? (
        <button
          type="button"
          className={cn(Typography.Small, "font-bold underline text-t1 hover:text-t2")}
          onClick={() => router.push(`/quotes?search=${encodeURIComponent(quoteRef)}`)}
        >
          {quoteRef}
        </button>
      ) : (
        <span className="text-t3">—</span>
      ),
    },
    {
      id: "invoices",
      label: "Invoices",
      icon: <Receipt className="h-3.5 w-3.5" aria-hidden />,
      value: invoice !== "—" ? (
        <button
          type="button"
          className={cn(Typography.Small, "font-bold underline text-t1 hover:text-t2")}
          onClick={() => router.push("/billing")}
        >
          {invoice}
        </button>
      ) : (
        <span className={cn(Typography.Small, "text-t3")}>—</span>
      ),
    },
    {
      id: "documents",
      label: "Documents",
      icon: <Folder className="h-3.5 w-3.5" aria-hidden />,
      value: (
        <button
          type="button"
          className={cn(Typography.Small, "font-bold underline text-t1 hover:text-t2")}
          onClick={onOpenDocuments}
        >
          Job documents
        </button>
      ),
    },
    {
      id: "client",
      label: "Client",
      icon: <Building2 className="h-3.5 w-3.5" aria-hidden />,
      value: job.clientId ? (
        <button
          type="button"
          className={cn(Typography.Small, "font-bold underline text-t1 hover:text-t2 truncate max-w-[70%]")}
          onClick={() => router.push(`/clients/${job.clientId}`)}
        >
          {job.clientCompany}
        </button>
      ) : (
        <span className={cn(Typography.Small, "font-semibold text-t1 truncate max-w-[70%]")}>
          {job.clientCompany}
        </span>
      ),
    },
  ]

  return (
    <section className="rounded-xl border border-bd bg-sr p-6 sm:p-8 w-full">
      <h3
        className={cn(
          Typography.Helper,
          "font-bold uppercase tracking-widest text-t3 border-b border-surface-low pb-4 mb-6",
        )}
      >
        Linked Records
      </h3>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
        {rows.map(row => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-3 border-b border-surface-low pb-4"
          >
            <div className={cn(Typography.Small, "flex items-center gap-3 text-t3")}>
              {row.icon}
              <span>{row.label}</span>
            </div>
            {row.value}
          </li>
        ))}
      </ul>
    </section>
  )
}
