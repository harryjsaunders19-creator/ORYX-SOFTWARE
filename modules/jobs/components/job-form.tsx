"use client"
import { useState } from "react"
import { Button }   from "@/shared/ui/button"
import { Input }    from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import { Field } from "@/shared/ui/field"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/ui/select"
import { JOB_STATUSES, CREATABLE_ITEM_TYPES, JOB_TAGS, OTHER_WORKS_TYPE, getWorkItemRefHint } from "@/lib/constants"
import { ClientCombobox } from "@/components/client-combobox"
import { DesignerCombobox } from "@/components/designer-combobox"
import { TypeOfWorksCombobox } from "@/components/type-of-works-combobox"
import { QuickCreateClientModal } from "@/components/quick-create-client-modal"
import { HoldWarningDialog } from "@/shared/ui/hold-warning-dialog"
import { defaultRequiredByDate, totalJobCommercialValue, formatGBP } from "@/shared/utils/utils"
import type { Job, JobFormData } from "@/lib/types"
import { composeJobAddress } from "@/modules/job-map/utils/job-address"

function emptyJobForm(): JobFormData {
  return {
    itemType: "DESIGN",
    siteName: "", siteAddress: "", address: "",
    typeOfWorks: "", customTypeDescription: "", clientCompany: "", clientId: "", requestedBy: "",
    status: "NEW_REQUEST", designer: "", dateCompleted: "", notes: "",
    designStandards: "",
    tags: [],
    quoteValue: "", quoteReference: "", quoteDate: "", commercialNotes: "",
    variationFees: "", additionalCharges: "",
    requiredByDate: defaultRequiredByDate(),
  }
}

type FieldErrors = Partial<Record<keyof JobFormData, string>>

function validate(f: JobFormData): FieldErrors {
  const e: FieldErrors = {}
  if (!f.siteName.trim() && !f.siteAddress.trim()) {
    e.siteAddress = "Site name or address required"
  }
  if (!f.clientCompany.trim()) e.clientCompany = "Required"
  if (!f.requestedBy.trim())   e.requestedBy   = "Required"
  // typeOfWorks only required for Design
  if (f.itemType === "DESIGN" && !f.typeOfWorks.trim()) e.typeOfWorks = "Required for Design items"
  if (f.typeOfWorks === OTHER_WORKS_TYPE && !f.customTypeDescription.trim()) {
    e.customTypeDescription = "Please specify the type of works"
  }
  return e
}

function SH({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-t4 border-b border-bd pb-1 mb-3">
      {children}
    </p>
  )
}

export interface JobFormProps {
  job?:      Job
  formId:    string
  onSubmit:  (data: JobFormData) => Promise<void>
  /** Pre-loaded designer names passed down from the jobs table — avoids a
   *  redundant /api/jobs/designers fetch when the table already has them. */
  designers?: string[]
}

export function JobForm({ job, formId, onSubmit, designers }: JobFormProps) {
  const [form, setForm] = useState<JobFormData>(() =>
    job ? {
      itemType:        job.itemType ?? "DESIGN",
      siteName:        job.siteName ?? "",
      siteAddress:     job.siteAddress ?? job.address ?? "",
      address:         job.address,
      typeOfWorks:     job.typeOfWorks,
      customTypeDescription: job.customTypeDescription ?? "",
      clientCompany:   job.clientCompany,
      clientId:        job.clientId ?? "",
      requestedBy:     job.requestedBy,
      status:          job.status,
      designer:        job.designer,
      dateCompleted:   job.dateCompleted ? new Date(job.dateCompleted).toISOString().split("T")[0] : "",
      notes:           job.notes ?? "",
      designStandards: job.designStandards ?? "",
      tags:            Array.isArray(job.tags) ? [...job.tags] : [],
      quoteValue:      job.quoteValue != null ? String(job.quoteValue) : "",
      quoteReference:  job.quoteReference ?? "",
      quoteDate:       job.quoteDate ?? "",
      commercialNotes: job.commercialNotes ?? "",
      variationFees:   job.variationFees != null ? String(job.variationFees) : "",
      additionalCharges: job.additionalCharges != null ? String(job.additionalCharges) : "",
      requiredByDate:  job.requiredByDate ?? "",
    } : emptyJobForm()
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [quickCreateName, setQuickCreateName] = useState("")
  const [holdWarning, setHoldWarning] = useState<{ reason: string; pendingSubmit: JobFormData } | null>(null)

  const setF   = (k: keyof JobFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))
  const setSel = (k: keyof JobFormData) => (v: string) => setForm(f => ({ ...f, [k]: v }))
  const setTypeOfWorks = (v: string) =>
    setForm(f => ({ ...f, typeOfWorks: v, customTypeDescription: v === OTHER_WORKS_TYPE ? f.customTypeDescription : "" }))

  const isDesign = form.itemType === "DESIGN"
  const isRevision = form.itemType === "REVISION"
  const needsTypeOfWorks = isDesign || isRevision

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})

    // Check if selected client is on hold before submitting — only relevant when
    // creating new work; editing an existing job (e.g. just reassigning a designer)
    // shouldn't trigger a "this will create new work for a held client" warning.
    if (!job && form.clientId) {
      try {
        const res = await fetch(`/api/clients/${form.clientId}/hold`)
        if (res.ok) {
          const { hold } = await res.json() as { hold: { reason: string } | null }
          if (hold) {
            // Show hold warning — don't submit yet
            setHoldWarning({ reason: hold.reason, pendingSubmit: { ...form } })
            return
          }
        }
      } catch { /* network error — proceed anyway */ }
    }

    setSaving(true)
    try {
      const payload = {
        ...form,
        address: composeJobAddress(form.siteName, form.siteAddress, form.address),
      }
      await onSubmit(payload)
    } catch { /* parent shows toast */ } finally { setSaving(false) }
  }

  const proceedDespiteHold = async () => {
    if (!holdWarning) return
    setHoldWarning(null)
    setSaving(true)
    try {
      const payload = {
        ...holdWarning.pendingSubmit,
        address: composeJobAddress(
          holdWarning.pendingSubmit.siteName,
          holdWarning.pendingSubmit.siteAddress,
          holdWarning.pendingSubmit.address,
        ),
        proceedDespiteHold: true,
      }
      await onSubmit(payload)
    } catch { /* parent shows toast */ } finally { setSaving(false) }
  }

  // Determine which item types can be shown in the type selector
  // When editing, itemType is immutable (locked). Survey/Inspection are not creatable.
  const selectableTypes = CREATABLE_ITEM_TYPES

  const toggleTag = (tag: string) => {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag],
    }))
  }

  return (
    <form id={formId} onSubmit={handleSubmit} noValidate data-saving={saving ? "true" : undefined}>

      {/* Drawing number chip — edit mode only */}
      {job && (
        <div className="flex items-center gap-3 mb-5 px-3 py-2 bg-pg border border-bd rounded-md">
          <span className="text-xs text-t4 uppercase tracking-wider shrink-0">Reference</span>
          <span className="font-mono text-sm font-semibold text-ac">{job.drawingNumber}</span>
        </div>
      )}

      {/* Work item type selector — create mode only; locked on edit */}
      {!job && (
        <div className="mb-5">
          <SH>Work item type</SH>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {selectableTypes.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setSel("itemType")(t.value)}
                className={`px-3 py-2 rounded border text-left text-sm font-medium transition-none ${
                  form.itemType === t.value
                    ? `${t.color} ring-2 ring-offset-1 ring-current`
                    : "border-bd text-t3 hover:text-t2 hover:border-bds bg-sr"
                }`}
              >
                <p className="font-semibold">{t.label}</p>
                <p className="text-[11px] opacity-75 mt-0.5">
                  {getWorkItemRefHint(t.value)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">

        {/* Left: Site + Client */}
        <div className="space-y-5">
          <div>
            <SH>Site</SH>
            <div className="space-y-3">
              <Field label="Site name" hint="Building or site description (e.g. Selfridges)">
                <Input value={form.siteName} onChange={setF("siteName")}
                  placeholder="The Old Admiralty Building"
                  autoComplete="off" autoFocus={!job} />
              </Field>
              <Field label="Site address" required error={errors.siteAddress}
                hint="Full postal address for geocoding when available">
                <Input value={form.siteAddress} onChange={setF("siteAddress")}
                  placeholder="400 Oxford Street, London, W1A 1AB"
                  autoComplete="off" />
              </Field>
              {needsTypeOfWorks && (
                <Field label="Type of works" required={isDesign} error={errors.typeOfWorks}>
                  <TypeOfWorksCombobox
                    value={form.typeOfWorks}
                    onChange={setTypeOfWorks}
                    error={!!errors.typeOfWorks}
                  />
                </Field>
              )}
              {needsTypeOfWorks && form.typeOfWorks === OTHER_WORKS_TYPE && (
                <Field label="Specify type of works" required error={errors.customTypeDescription}>
                  <Input
                    value={form.customTypeDescription}
                    onChange={setF("customTypeDescription")}
                    placeholder="e.g. Temporary Pedestrian Tunnel"
                    autoComplete="off" autoFocus
                  />
                </Field>
              )}
            </div>
          </div>
          <div>
            <SH>Client</SH>
            <div className="space-y-3">
              <Field label="Client" required error={errors.clientCompany}>
                <ClientCombobox
                  value={form.clientId}
                  name={form.clientCompany}
                  onChange={(clientId, clientName, onHold, holdReason, contactName) => {
                    setForm(f => ({
                      ...f, clientId, clientCompany: clientName,
                      // Sensible default: most requests are made by the client's usual contact —
                      // pre-fill it but never overwrite something the user already typed.
                      requestedBy: !f.requestedBy.trim() && contactName ? contactName : f.requestedBy,
                    }))
                    // Clear any previous hold warning when client changes
                    if (!onHold) setHoldWarning(null)
                  }}
                  onCreateNew={name => setQuickCreateName(name)}
                />
                {errors.clientCompany && <p className="text-xs text-dn mt-0.5">{errors.clientCompany}</p>}
              </Field>
              <Field label="Requested by" required error={errors.requestedBy} hint="Defaults to the client's contact">
                <Input value={form.requestedBy} onChange={setF("requestedBy")}
                  placeholder="James Carter" autoComplete="off" />
              </Field>
            </div>
          </div>
        </div>

        {/* Right: Assignment + Status + Notes */}
        <div className="space-y-5">
          <div>
            <SH>Assignment</SH>
            <div className="space-y-3">
              <Field label="Designer / Engineer" hint="Users directory only — same list as Performance">
                <DesignerCombobox value={form.designer} onChange={v => setForm(f => ({ ...f, designer: v }))}
                  placeholder="Select a user…" designers={designers} />
              </Field>
              {job && (
                <Field label="Status">
                  <Select value={form.status} onValueChange={setSel("status")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {JOB_STATUSES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field label="Date completed">
                <Input type="date" value={form.dateCompleted} onChange={setF("dateCompleted")} />
              </Field>
              <Field label="Required by" hint="Defaults to 1 week from today if left blank">
                <Input type="date" value={form.requiredByDate} onChange={setF("requiredByDate")} />
              </Field>
            </div>
          </div>
          <div>
            <SH>Notes</SH>
            <Textarea value={form.notes} onChange={setF("notes")}
              placeholder="Additional requirements or context…" rows={3} />
          </div>
          <div>
            <SH>Design Standards & Codes</SH>
            <Textarea
              value={form.designStandards}
              onChange={setF("designStandards")}
              placeholder={"List each standard/code on a new line (e.g. BS EN 12811-1)\nTG20:21\nBS 5975"}
              rows={3}
            />
          </div>
          <div>
            <SH>Tags</SH>
            <p className="text-xs text-t4 mb-2">Optional labels for scaffold type and site constraints.</p>
            <div className="flex flex-wrap gap-1.5">
              {JOB_TAGS.map(tag => {
                const selected = form.tags.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-pressed={selected}
                    className={`text-[11px] px-2 py-1 rounded border font-medium transition-none ${
                      selected
                        ? "bg-ac text-on-ac border-ac"
                        : "border-bd text-t3 hover:text-t2 hover:border-bds bg-sr"
                    }`}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <SH>Commercial</SH>
            <div className="space-y-3">
              <Field label="Quote value (£)">
                <Input value={form.quoteValue} onChange={setF("quoteValue")}
                  placeholder="e.g. 1250" inputMode="decimal" autoComplete="off" />
              </Field>
              <Field label="Variation fees (£)" hint="Scope changes after the original quote">
                <Input value={form.variationFees} onChange={setF("variationFees")}
                  placeholder="e.g. 250" inputMode="decimal" autoComplete="off" />
              </Field>
              <Field label="Additional charges (£)" hint="Site visits, hourly revision work, etc.">
                <Input value={form.additionalCharges} onChange={setF("additionalCharges")}
                  placeholder="e.g. 95" inputMode="decimal" autoComplete="off" />
              </Field>
              {(form.quoteValue || form.variationFees || form.additionalCharges) && (() => {
                const total = totalJobCommercialValue({
                  quoteValue: form.quoteValue ? parseFloat(form.quoteValue) : null,
                  variationFees: form.variationFees ? parseFloat(form.variationFees) : null,
                  additionalCharges: form.additionalCharges ? parseFloat(form.additionalCharges) : null,
                })
                return total != null ? (
                  <p className="text-xs text-t3">
                    Total agreed: <span className="font-semibold text-t1 tabular-nums">{formatGBP(total)}</span>
                  </p>
                ) : null
              })()}
              <Field label="Quote reference">
                <Input value={form.quoteReference} onChange={setF("quoteReference")}
                  placeholder="e.g. QT-2026-047" autoComplete="off" />
              </Field>
              <Field label="Quote date">
                <Input type="date" value={form.quoteDate} onChange={setF("quoteDate")} />
              </Field>
              <Field label="Commercial notes">
                <Textarea value={form.commercialNotes} onChange={setF("commercialNotes")}
                  placeholder="Pricing notes, agreed terms…" rows={2} />
              </Field>
            </div>
          </div>
        </div>
      </div>
      <HoldWarningDialog
        open={!!holdWarning}
        reason={holdWarning?.reason ?? ""}
        saving={saving}
        onCancel={() => setHoldWarning(null)}
        onContinue={proceedDespiteHold}
        cancelLabel="Cancel job creation"
      />

    {/* Quick-create client modal */}
      {quickCreateName && (
        <QuickCreateClientModal
          initialName={quickCreateName}
          onCreated={(client) => {
            setForm(f => ({ ...f, clientId: client.id, clientCompany: client.name }))
            setQuickCreateName("")
          }}
          onClose={() => setQuickCreateName("")}
        />
      )}
    </form>
  )
}


