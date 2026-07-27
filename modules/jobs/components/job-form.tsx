"use client"
import { useState } from "react"
import { Button }   from "@/shared/ui/button"
import { Input }    from "@/shared/ui/input"
import { Label }    from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/ui/select"
import { JOB_STATUSES, CREATABLE_ITEM_TYPES, JOB_TAGS, OTHER_WORKS_TYPE, getWorkItemRefHint } from "@/lib/constants"
import { AlertTriangle } from "lucide-react"
import { ClientCombobox } from "@/components/client-combobox"
import { DesignerCombobox } from "@/components/designer-combobox"
import { TypeOfWorksCombobox } from "@/components/type-of-works-combobox"
import { QuickCreateClientModal } from "@/components/quick-create-client-modal"
import { defaultRequiredByDate, totalJobCommercialValue, formatGBP } from "@/shared/utils/utils"
import type { Job, JobFormData } from "@/lib/types"
import { composeJobAddress } from "@/modules/job-map/utils/job-address"

function emptyJobForm(): JobFormData {
  return {
    itemType: "DESIGN",
    siteName: "", siteAddress: "", address: "",
    typeOfWorks: "", customTypeDescription: "", clientCompany: "", clientId: "", requestedBy: "",
    status: "NEW_REQUEST", designer: "", dateCompleted: "", notes: "",
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

function F({ label, required, error, hint, children }: {
  label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>
        {label}{required && <span className="text-dn ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-dn">{error}</p>}
      {!error && hint && <p className="text-xs text-t4">{hint}</p>}
    </div>
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
              <F label="Site name" hint="Building or site description (e.g. Selfridges)">
                <Input value={form.siteName} onChange={setF("siteName")}
                  placeholder="The Old Admiralty Building"
                  autoComplete="off" autoFocus={!job} />
              </F>
              <F label="Site address" required error={errors.siteAddress}
                hint="Full postal address for geocoding when available">
                <Input value={form.siteAddress} onChange={setF("siteAddress")}
                  placeholder="400 Oxford Street, London, W1A 1AB"
                  autoComplete="off" />
              </F>
              {needsTypeOfWorks && (
                <F label="Type of works" required={isDesign} error={errors.typeOfWorks}>
                  <TypeOfWorksCombobox
                    value={form.typeOfWorks}
                    onChange={setTypeOfWorks}
                    error={!!errors.typeOfWorks}
                  />
                </F>
              )}
              {needsTypeOfWorks && form.typeOfWorks === OTHER_WORKS_TYPE && (
                <F label="Specify type of works" required error={errors.customTypeDescription}>
                  <Input
                    value={form.customTypeDescription}
                    onChange={setF("customTypeDescription")}
                    placeholder="e.g. Temporary Pedestrian Tunnel"
                    autoComplete="off" autoFocus
                  />
                </F>
              )}
            </div>
          </div>
          <div>
            <SH>Client</SH>
            <div className="space-y-3">
              <F label="Client" required error={errors.clientCompany}>
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
              </F>
              <F label="Requested by" required error={errors.requestedBy} hint="Defaults to the client's contact">
                <Input value={form.requestedBy} onChange={setF("requestedBy")}
                  placeholder="James Carter" autoComplete="off" />
              </F>
            </div>
          </div>
        </div>

        {/* Right: Assignment + Status + Notes */}
        <div className="space-y-5">
          <div>
            <SH>Assignment</SH>
            <div className="space-y-3">
              <F label="Designer / Engineer" hint={!job ? "Can be assigned later" : undefined}>
                <DesignerCombobox value={form.designer} onChange={v => setForm(f => ({ ...f, designer: v }))}
                  placeholder="Sarah Mitchell (optional)" designers={designers} />
              </F>
              {job && (
                <F label="Status">
                  <Select value={form.status} onValueChange={setSel("status")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {JOB_STATUSES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </F>
              )}
              <F label="Date completed">
                <Input type="date" value={form.dateCompleted} onChange={setF("dateCompleted")} />
              </F>
              <F label="Required by" hint="Defaults to 1 week from today if left blank">
                <Input type="date" value={form.requiredByDate} onChange={setF("requiredByDate")} />
              </F>
            </div>
          </div>
          <div>
            <SH>Notes</SH>
            <Textarea value={form.notes} onChange={setF("notes")}
              placeholder="Additional requirements or context…" rows={3} />
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
              <F label="Quote value (£)">
                <Input value={form.quoteValue} onChange={setF("quoteValue")}
                  placeholder="e.g. 1250" inputMode="decimal" autoComplete="off" />
              </F>
              <F label="Variation fees (£)" hint="Scope changes after the original quote">
                <Input value={form.variationFees} onChange={setF("variationFees")}
                  placeholder="e.g. 250" inputMode="decimal" autoComplete="off" />
              </F>
              <F label="Additional charges (£)" hint="Site visits, hourly revision work, etc.">
                <Input value={form.additionalCharges} onChange={setF("additionalCharges")}
                  placeholder="e.g. 95" inputMode="decimal" autoComplete="off" />
              </F>
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
              <F label="Quote reference">
                <Input value={form.quoteReference} onChange={setF("quoteReference")}
                  placeholder="e.g. QT-2026-047" autoComplete="off" />
              </F>
              <F label="Quote date">
                <Input type="date" value={form.quoteDate} onChange={setF("quoteDate")} />
              </F>
              <F label="Commercial notes">
                <Textarea value={form.commercialNotes} onChange={setF("commercialNotes")}
                  placeholder="Pricing notes, agreed terms…" rows={2} />
              </F>
            </div>
          </div>
        </div>
      </div>
    {/* CLIENT ON HOLD warning — shown before job creation proceeds */}
      {holdWarning && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div
            className="bg-sr rounded-xl border-2 border-dn shadow-modal w-[calc(100vw-2rem)] max-w-[440px] overflow-hidden"
            style={{ background: "var(--color-sr)", border: "2px solid var(--color-dn)" }}
          >
            {/* Red header */}
            <div className="bg-dn px-6 py-4 flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-white shrink-0" />
              <div>
                <p className="text-base font-bold text-white">Client On Hold</p>
                <p className="text-white/85 text-xs mt-0.5">This client is currently restricted from receiving new work.</p>
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="bg-dn-bg border border-dn-bd rounded-md px-4 py-3 mb-5">
                <p className="text-xs font-semibold text-dn uppercase tracking-wider mb-1">Reason</p>
                <p className="text-sm text-dn-tx font-medium">{holdWarning.reason}</p>
              </div>
              <p className="text-sm text-t2 mb-5">
                You may cancel and return to the job form, or continue creating the job regardless.
                All actions are recorded.
              </p>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setHoldWarning(null)}
                >
                  Cancel job creation
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  className="flex-1"
                  onClick={proceedDespiteHold}
                  loading={saving}
                >
                  Continue anyway
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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


