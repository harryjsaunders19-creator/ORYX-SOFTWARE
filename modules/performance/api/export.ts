import { NextRequest, NextResponse } from "next/server"
import ExcelJS from "exceljs"
import { PDFDocument, StandardFonts } from "pdf-lib"
import { apiInternalError } from "@/shared/api-errors"
import { requireRole, requireFullAccess } from "@/shared/auth/auth"
import { buildPerformancePayload, resolvePerformanceFilters, resolvePerformancePeriod } from "../services/performance-service"

function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value)
  if (!/[,"\n]/.test(text)) return text
  return `"${text.replace(/"/g, "\"\"")}"`
}

function toCsv(payload: Awaited<ReturnType<typeof buildPerformancePayload>>): string {
  const lines: string[] = []
  lines.push("Metric,Value,Previous,Delta,Delta %")
  for (const metric of payload.kpis) {
    lines.push([
      csvEscape(metric.label),
      csvEscape(metric.value),
      csvEscape(metric.previousValue),
      csvEscape(metric.delta),
      csvEscape(metric.deltaPct == null ? "" : metric.deltaPct),
    ].join(","))
  }
  lines.push("")
  lines.push("Drawing Number,Client,Engineer,Status,Type,Created,Completed,Required By")
  for (const job of payload.jobs) {
    lines.push([
      csvEscape(job.drawingNumber),
      csvEscape(job.clientCompany),
      csvEscape(job.designer),
      csvEscape(job.status),
      csvEscape(job.itemType),
      csvEscape(job.createdDate),
      csvEscape(job.completedDate ?? ""),
      csvEscape(job.requiredByDate ?? ""),
    ].join(","))
  }
  return lines.join("\n")
}

async function toExcel(payload: Awaited<ReturnType<typeof buildPerformancePayload>>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const kpi = workbook.addWorksheet("KPI Summary")
  kpi.addRow(["Metric", "Value", "Previous", "Delta", "Delta %"])
  for (const metric of payload.kpis) {
    kpi.addRow([metric.label, metric.value, metric.previousValue, metric.delta, metric.deltaPct ?? ""])
  }
  const jobs = workbook.addWorksheet("Jobs")
  jobs.addRow(["Drawing Number", "Client", "Engineer", "Status", "Type", "Created", "Completed", "Required By", "Tags"])
  for (const job of payload.jobs) {
    jobs.addRow([
      job.drawingNumber,
      job.clientCompany,
      job.designer,
      job.status,
      job.itemType,
      job.createdDate,
      job.completedDate ?? "",
      job.requiredByDate ?? "",
      job.tags.join(", "),
    ])
  }
  const buf = await workbook.xlsx.writeBuffer()
  return Buffer.from(buf)
}

async function toPdf(payload: Awaited<ReturnType<typeof buildPerformancePayload>>): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const page = pdf.addPage([595.28, 841.89])
  let y = 800
  page.drawText("Performance & Analytics Summary", { x: 40, y, size: 18, font: bold })
  y -= 24
  page.drawText(`Period: ${payload.period.from} to ${payload.period.to}`, { x: 40, y, size: 10, font })
  y -= 20
  for (const metric of payload.kpis.slice(0, 14)) {
    page.drawText(`${metric.label}: ${metric.value} (prev ${metric.previousValue})`, { x: 40, y, size: 10, font })
    y -= 14
  }
  y -= 8
  page.drawText("Top Engineers", { x: 40, y, size: 12, font: bold })
  y -= 16
  for (const row of payload.engineerRows.slice(0, 10)) {
    page.drawText(`${row.name} — completed ${row.jobsCompleted}, assigned ${row.jobsAssigned}, avg turnaround ${row.avgTurnaroundDays}d`, { x: 40, y, size: 9, font })
    y -= 12
    if (y < 60) break
  }
  return pdf.save()
}

export async function GET(req: NextRequest) {
  const auth = await requireFullAccess()
  if (auth instanceof NextResponse) return auth
  try {
    const query = req.nextUrl.searchParams
    const format = (query.get("format") ?? "csv").toLowerCase()
    const period = resolvePerformancePeriod(query.get("from"), query.get("to"))
    const filters = resolvePerformanceFilters(period, query)
    const payload = await buildPerformancePayload(filters, period)
    const stamp = `${period.from}_${period.to}`
    if (format === "xlsx") {
      const body = await toExcel(payload)
      return new NextResponse(body as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="performance-${stamp}.xlsx"`,
        },
      })
    }
    if (format === "pdf") {
      const body = await toPdf(payload)
      return new NextResponse(body as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="performance-${stamp}.pdf"`,
        },
      })
    }
    const body = toCsv(payload)
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="performance-${stamp}.csv"`,
      },
    })
  } catch (err) {
    return apiInternalError("performance.export", err)
  }
}
