"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Check, Plus, PenTool, MapPin, ShieldCheck, X,
} from "lucide-react"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import { Field } from "@/shared/ui/field"
import { Button } from "@/shared/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/ui/select"
import {
  JOB_STATUSES, CREATABLE_ITEM_TYPES, OTHER_WORKS_TYPE, getWorkItemRefHint,
  WORKS_TYPES, JOB_TAGS,
} from "@/lib/constants"
import { ClientCombobox } from "@/components/client-combobox"
import { DesignerCombobox } from "@/components/designer-combobox"
import { QuickCreateClientModal } from "@/components/quick-create-client-modal"
import { HoldWarningDialog } from "@/shared/ui/hold-warning-dialog"
import { defaultRequiredByDate } from "@/shared/utils/utils"
import { cn } from "@/shared/utils"
import type { Job, JobFormData } from "@/lib/types"
import { composeJobAddress } from "@/modules/job-map/utils/job-address"
import { addCustomWorksType, readCustomWorksTypes } from "./custom-works-types"

/** Featured chips — short labels mapped onto controlled WORKS_TYPES values. */
const FEATURED_WORKS: { label: string; value: string }[] = [
  { label: "Scaffold", value: "Access Scaffold" },
  { label: "Temporary roof", value: "Temporary Roof" },
  { label: "Hoist", value: "Hoist Tower / Lifting Frame" },
  { label: "Stair tower", value: "Staircase / Tower" },
  { label: "Gantry", value: "Gantry" },
  { label: "Bridge", value: "Bridged Access" },
  { label: "Loading bay", value: "Loading Bay" },
]

const TYPE_META: Record<string, {
  icon: React.ElementType
  title: string
  description: string
}> = {
  DESIGN: {
    icon: PenTool,
    title: "Design",
    description: "Scaffold design package with drawing number allocation.",
  },
  SITE_VISIT: {
    icon: MapPin,
    title: "Site visit",
    description: "On-site assessment or meeting — SV reference issued.",
  },
  CATIII_DESIGN_CHECK: {
    icon: ShieldCheck,
    title: "CAT III design check",
    description: "Independent design check — CAT3 reference issued.",
  },
}

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
    e.siteAddress = "Enter a site name or address"
  }
  if (!f.clientCompany.trim()) e.clientCompany = "Select a client"
  if (!f.requestedBy.trim()) e.requestedBy = "Enter who requested the work"
  if (f.itemType === "DESIGN" && !f.typeOfWorks.trim()) {
    e.typeOfWorks = "Select a type of works"
  }
  if (f.typeOfWorks === OTHER_WORKS_TYPE && !f.customTypeDescription.trim()) {
    e.customTypeDescription = "Describe the type of works"
  }
  return e
}

function Section({
  step,
  title,
  question,
  children,
}: {
  step: number
  title: string
  question: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-pg type-badge tabular-nums text-t2">
          {step}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-t1">{title}</h3>
          <p className="mt-0.5 text-xs text-t3">{question}</p>
        </div>
      </div>
      <div className="pl-0 sm:pl-9">{children}</div>
    </section>
  )
}

function Divider() {
  return <div className="h-px bg-bd" role="separator" />
}

export interface JobFormProps {
  job?: Job
  formId: string
  onSubmit: (data: JobFormData) => Promise<void>
  /** Pre-loaded designer names from the jobs table. */
  designers?: string[]
}

export function JobForm({ job, formId, onSubmit, designers }: JobFormProps) {
  const [form, setForm] = useState<JobFormData>(() =>
    job ? {
      itemType: job.itemType ?? "DESIGN",
      siteName: job.siteName ?? "",
      siteAddress: job.siteAddress ?? job.address ?? "",
      address: job.address,
      typeOfWorks: job.typeOfWorks,
      customTypeDescription: job.customTypeDescription ?? "",
      clientCompany: job.clientCompany,
      clientId: job.clientId ?? "",
      requestedBy: job.requestedBy,
      status: job.status,
      designer: job.designer,
      dateCompleted: job.dateCompleted ? new Date(job.dateCompleted).toISOString().split("T")[0] : "",
      notes: job.notes ?? "",
      designStandards: job.designStandards ?? "",
      tags: Array.isArray(job.tags) ? [...job.tags] : [],
      quoteValue: job.quoteValue != null ? String(job.quoteValue) : "",
      quoteReference: job.quoteReference ?? "",
      quoteDate: job.quoteDate ?? "",
      commercialNotes: job.commercialNotes ?? "",
      variationFees: job.variationFees != null ? String(job.variationFees) : "",
      additionalCharges: job.additionalCharges != null ? String(job.additionalCharges) : "",
      requiredByDate: job.requiredByDate ?? "",
    } : emptyJobForm(),
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [quickCreateName, setQuickCreateName] = useState("")
  const [holdWarning, setHoldWarning] = useState<{ reason: string; pendingSubmit: JobFormData } | null>(null)
  const [customTypes, setCustomTypes] = useState<string[]>([])
  const [addingType, setAddingType] = useState(false)
  const [newTypeLabel, setNewTypeLabel] = useState("")
  const [showMoreTypes, setShowMoreTypes] = useState(false)

  useEffect(() => {
    setCustomTypes(readCustomWorksTypes())
  }, [])

  const setF = (k: keyof JobFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm(f => ({ ...f, [k]: e.target.value }))
      if (errors[k]) setErrors(prev => ({ ...prev, [k]: undefined }))
    }

  const setSel = (k: keyof JobFormData) => (v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    if (errors[k]) setErrors(prev => ({ ...prev, [k]: undefined }))
  }

  const isDesign = form.itemType === "DESIGN"
  const isSiteVisit = form.itemType === "SITE_VISIT"
  const isCatIii = form.itemType === "CATIII_DESIGN_CHECK"
  const needsTypeOfWorks = isDesign || form.itemType === "REVISION"
  const showCommercial = isDesign || (!isSiteVisit && !isCatIii) || !!job

  const selectedWorksLabel = useMemo(() => {
    if (!form.typeOfWorks) return null
    if (form.typeOfWorks === OTHER_WORKS_TYPE) return form.customTypeDescription || OTHER_WORKS_TYPE
    return form.typeOfWorks
  }, [form.typeOfWorks, form.customTypeDescription])

  const selectWorksType = (value: string, customDescription = "") => {
    if (value === OTHER_WORKS_TYPE || customDescription) {
      setForm(f => ({
        ...f,
        typeOfWorks: OTHER_WORKS_TYPE,
        customTypeDescription: customDescription || f.customTypeDescription,
      }))
    } else {
      setForm(f => ({
        ...f,
        typeOfWorks: value,
        customTypeDescription: "",
      }))
    }
    setErrors(prev => ({ ...prev, typeOfWorks: undefined, customTypeDescription: undefined }))
  }

  const isWorksSelected = (value: string, custom = false) => {
    if (custom) {
      return form.typeOfWorks === OTHER_WORKS_TYPE
        && form.customTypeDescription.toLowerCase() === value.toLowerCase()
    }
    return form.typeOfWorks === value
  }

  const commitNewType = () => {
    const label = newTypeLabel.trim()
    if (!label) return
    // Avoid duplicating a controlled type under a different casing
    const controlled = (WORKS_TYPES as readonly string[]).find(
      t => t.toLowerCase() === label.toLowerCase(),
    )
    if (controlled && controlled !== OTHER_WORKS_TYPE) {
      selectWorksType(controlled)
    } else {
      const next = addCustomWorksType(label)
      setCustomTypes(next)
      selectWorksType(OTHER_WORKS_TYPE, label)
    }
    setNewTypeLabel("")
    setAddingType(false)
  }

  const moreTypes = (WORKS_TYPES as readonly string[]).filter(
    t => t !== OTHER_WORKS_TYPE && !FEATURED_WORKS.some(f => f.value === t),
  )

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})

    if (!job && form.clientId) {
      try {
        const res = await fetch(`/api/clients/${form.clientId}/hold`)
        if (res.ok) {
          const { hold } = await res.json() as { hold: { reason: string } | null }
          if (hold) {
            setHoldWarning({ reason: hold.reason, pendingSubmit: { ...form } })
            return
          }
        }
      } catch { /* proceed */ }
    }

    setSaving(true)
    try {
      await onSubmit({
        ...form,
        address: composeJobAddress(form.siteName, form.siteAddress, form.address),
        // Create workflow never sets completion date — status change owns that.
        dateCompleted: job ? form.dateCompleted : "",
      })
    } catch { /* parent toast */ } finally {
      setSaving(false)
    }
  }

  const proceedDespiteHold = async () => {
    if (!holdWarning) return
    setHoldWarning(null)
    setSaving(true)
    try {
      const pending = holdWarning.pendingSubmit
      await onSubmit({
        ...pending,
        address: composeJobAddress(pending.siteName, pending.siteAddress, pending.address),
        dateCompleted: job ? pending.dateCompleted : "",
        proceedDespiteHold: true,
      })
    } catch { /* parent toast */ } finally {
      setSaving(false)
    }
  }

  const selectableTypes = CREATABLE_ITEM_TYPES
  const controlStyle = { height: "40px" } as const
  const controlClass = "h-10"

  const toggleTag = (tag: string) => {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag],
    }))
  }

  return (
    <form id={formId} onSubmit={handleSubmit} noValidate data-saving={saving ? "true" : undefined} className="space-y-8">
      {job && (
        <div className="flex items-center gap-3 rounded-xl border border-bd bg-pg px-4 py-3">
          <span className="text-xs text-t3 shrink-0">Reference</span>
          <span className="font-mono text-sm font-semibold text-t1">{job.drawingNumber}</span>
        </div>
      )}

      {/* 1 · What are you creating? */}
      {!job && (
        <>
          <Section step={1} title="What are you creating?" question="Choose the work item type to start.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {selectableTypes.map(t => {
                const meta = TYPE_META[t.value] ?? {
                  icon: PenTool,
                  title: t.label,
                  description: getWorkItemRefHint(t.value),
                }
                const Icon = meta.icon
                const selected = form.itemType === t.value
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => {
                      setForm(f => ({
                        ...f,
                        itemType: t.value,
                        ...(t.value !== "DESIGN"
                          ? { typeOfWorks: "", customTypeDescription: "" }
                          : {}),
                      }))
                      setErrors(prev => ({
                        ...prev,
                        typeOfWorks: undefined,
                        customTypeDescription: undefined,
                      }))
                    }}
                    className={cn(
                      "relative flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-colors duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-ic/40",
                      selected
                        ? "border-rs-bd bg-rs-bg shadow-sm"
                        : "border-bd bg-sr hover:border-bds hover:bg-surface-low/50",
                    )}
                    aria-pressed={selected}
                  >
                    {selected && (
                      <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-rs-ic text-white">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    )}
                    <span className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg",
                      selected ? "bg-white/70 text-rs-ic" : "bg-pg text-t3",
                    )}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className={cn("text-sm font-semibold", selected ? "text-rs-tx" : "text-t1")}>
                        {meta.title}
                      </p>
                      <p className="mt-1 font-mono type-helper text-t3">
                        {getWorkItemRefHint(t.value)}
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-t3">
                        {meta.description}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </Section>
          <Divider />
        </>
      )}

      {/* 2 · Project information */}
      <Section
        step={job ? 1 : 2}
        title="Project information"
        question={
          needsTypeOfWorks
            ? "Where is the work and what type of scaffold is involved?"
            : "Where is the work taking place?"
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Site name" hint="Building or site description">
              <Input
                className={controlClass}
                style={controlStyle}
                value={form.siteName}
                onChange={setF("siteName")}
                placeholder="e.g. Selfridges Oxford Street"
                autoComplete="off"
                autoFocus={!job}
              />
            </Field>
            <Field label="Site address" required error={errors.siteAddress} hint="Postal address for the site">
              <Input
                className={controlClass}
                style={controlStyle}
                value={form.siteAddress}
                onChange={setF("siteAddress")}
                placeholder="400 Oxford Street, London, W1A 1AB"
                autoComplete="off"
              />
            </Field>
          </div>

          {needsTypeOfWorks && (
            <Field label="Type of works" required={isDesign} error={errors.typeOfWorks}>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {FEATURED_WORKS.map(chip => {
                    const selected = isWorksSelected(chip.value)
                    return (
                      <button
                        key={chip.value}
                        type="button"
                        onClick={() => selectWorksType(chip.value)}
                        aria-pressed={selected}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-150",
                          selected
                            ? "border-rs-bd bg-rs-bg text-rs-tx"
                            : "border-bd bg-sr text-t2 hover:border-bds hover:text-t1",
                        )}
                      >
                        {chip.label}
                      </button>
                    )
                  })}
                  {customTypes.map(label => {
                    const selected = isWorksSelected(label, true)
                    return (
                      <button
                        key={`custom-${label}`}
                        type="button"
                        onClick={() => selectWorksType(OTHER_WORKS_TYPE, label)}
                        aria-pressed={selected}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-150",
                          selected
                            ? "border-rs-bd bg-rs-bg text-rs-tx"
                            : "border-bd bg-sr text-t2 hover:border-bds hover:text-t1",
                        )}
                      >
                        {label}
                      </button>
                    )
                  })}
                  {!addingType ? (
                    <button
                      type="button"
                      onClick={() => setAddingType(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-bd px-3 py-2 text-sm font-medium text-t3 transition-colors hover:border-bds hover:text-t1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add new type
                    </button>
                  ) : (
                    <div className="flex w-full max-w-sm items-center gap-2">
                      <Input
                        className={controlClass}
                style={controlStyle}
                        value={newTypeLabel}
                        onChange={e => setNewTypeLabel(e.target.value)}
                        placeholder="New type of works…"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            commitNewType()
                          }
                          if (e.key === "Escape") {
                            setAddingType(false)
                            setNewTypeLabel("")
                          }
                        }}
                      />
                      <Button type="button" size="sm" variant="primary" onClick={commitNewType}>
                        Add
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => { setAddingType(false); setNewTypeLabel("") }}
                        aria-label="Cancel add type"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowMoreTypes(v => !v)}
                    className="type-label text-t3 hover:text-t1"
                  >
                    {showMoreTypes ? "Hide more types" : "Show more types"}
                  </button>
                  {selectedWorksLabel && (
                    <span className="text-xs text-t3">
                      Selected: <span className="font-medium text-t2">{selectedWorksLabel}</span>
                    </span>
                  )}
                </div>

                {showMoreTypes && (
                  <div className="flex flex-wrap gap-2 rounded-xl border border-bd bg-pg/40 p-3">
                    {moreTypes.map(value => {
                      const selected = isWorksSelected(value)
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => selectWorksType(value)}
                          aria-pressed={selected}
                          className={cn(
                            "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                            selected
                              ? "border-rs-bd bg-rs-bg text-rs-tx"
                              : "border-bd bg-sr text-t2 hover:border-bds",
                          )}
                        >
                          {value}
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={() => selectWorksType(OTHER_WORKS_TYPE)}
                      aria-pressed={form.typeOfWorks === OTHER_WORKS_TYPE && !customTypes.some(t => isWorksSelected(t, true))}
                      className={cn(
                        "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                        form.typeOfWorks === OTHER_WORKS_TYPE && !form.customTypeDescription
                          ? "border-rs-bd bg-rs-bg text-rs-tx"
                          : "border-bd bg-sr text-t2 hover:border-bds",
                      )}
                    >
                      Other…
                    </button>
                  </div>
                )}

                {form.typeOfWorks === OTHER_WORKS_TYPE && (
                  <Field label="Describe type of works" required error={errors.customTypeDescription}>
                    <Input
                      className={controlClass}
                style={controlStyle}
                      value={form.customTypeDescription}
                      onChange={setF("customTypeDescription")}
                      placeholder="e.g. Temporary pedestrian tunnel"
                      autoComplete="off"
                    />
                  </Field>
                )}
              </div>
            </Field>
          )}
        </div>
      </Section>

      <Divider />

      {/* 3 · Client */}
      <Section
        step={job ? 2 : 3}
        title="Client information"
        question="Who is the client and who requested the work?"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Client" required error={errors.clientCompany}>
            <ClientCombobox
              value={form.clientId}
              name={form.clientCompany}
              onChange={(clientId, clientName, onHold, _holdReason, contactName) => {
                setForm(f => ({
                  ...f,
                  clientId,
                  clientCompany: clientName,
                  requestedBy: !f.requestedBy.trim() && contactName ? contactName : f.requestedBy,
                }))
                setErrors(prev => ({ ...prev, clientCompany: undefined }))
                if (!onHold) setHoldWarning(null)
              }}
              onCreateNew={name => setQuickCreateName(name)}
            />
            {errors.clientCompany && <p className="text-xs text-dn mt-0.5">{errors.clientCompany}</p>}
          </Field>
          <Field label="Requested by" required error={errors.requestedBy} hint="Defaults to the client contact when available">
            <Input
              className={controlClass}
                style={controlStyle}
              value={form.requestedBy}
              onChange={setF("requestedBy")}
              placeholder="e.g. James Carter"
              autoComplete="off"
            />
          </Field>
        </div>
      </Section>

      <Divider />

      {/* 4 · Assignment */}
      <Section
        step={job ? 3 : 4}
        title="Assignment & scheduling"
        question={isCatIii ? "Who is checking this, and when is it required?" : "Who is completing the work, and when is it required?"}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={isCatIii ? "Assigned checker" : "Assigned designer"}
            hint="From the Users directory"
          >
            <DesignerCombobox
              value={form.designer}
              onChange={v => setForm(f => ({ ...f, designer: v }))}
              placeholder={isCatIii ? "Select a checker…" : "Select a designer…"}
              designers={designers}
            />
          </Field>
          <Field label="Required by" hint="Defaults to one week from today">
            <Input
              className={controlClass}
                style={controlStyle}
              type="date"
              value={form.requiredByDate}
              onChange={setF("requiredByDate")}
            />
          </Field>
          {job && (
            <Field label="Status">
              <Select value={form.status} onValueChange={setSel("status")}>
                <SelectTrigger className={controlClass} style={controlStyle}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {JOB_STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
      </Section>

      <Divider />

      {/* 5 · Additional */}
      <Section
        step={job ? 4 : 5}
        title="Additional information"
        question={
          isSiteVisit
            ? "Any notes or tags for the visit?"
            : isCatIii
              ? "Anything the checker should know?"
              : "Anything else we need to know?"
        }
      >
        <div className="space-y-4">
          <Field label="Notes" hint={isCatIii ? "Scope of check, drawings to review…" : undefined}>
            <Textarea
              value={form.notes}
              onChange={setF("notes")}
              placeholder={
                isSiteVisit
                  ? "Visit purpose, contacts on site, access notes…"
                  : isCatIii
                    ? "Check brief, drawing references, standards to apply…"
                    : "Additional requirements or context…"
              }
              rows={3}
            />
          </Field>

          <Field
            label="Tags"
            hint="Optional labels for search and filtering (scaffold type, site constraints)."
          >
            <div className="flex flex-wrap gap-2">
              {JOB_TAGS.map(tag => {
                const selected = form.tags.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-pressed={selected}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-150",
                      selected
                        ? "border-rs-bd bg-rs-bg text-rs-tx"
                        : "border-bd bg-sr text-t2 hover:border-bds hover:text-t1",
                    )}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
            {form.tags.length > 0 && (
              <p className="mt-2 text-xs text-t3">
                {form.tags.length} selected — used in global search and job filters.
              </p>
            )}
          </Field>

          {(showCommercial || isDesign) && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Quote reference" hint="Optional operational reference">
                <Input
                  className={controlClass}
                  style={controlStyle}
                  value={form.quoteReference}
                  onChange={setF("quoteReference")}
                  placeholder="e.g. QT-2026-047"
                  autoComplete="off"
                />
              </Field>
              {!isSiteVisit && (
                <Field label="Quote value (£)" hint="Optional">
                  <Input
                    className={controlClass}
                    style={controlStyle}
                    value={form.quoteValue}
                    onChange={setF("quoteValue")}
                    placeholder="e.g. 1250"
                    inputMode="decimal"
                    autoComplete="off"
                  />
                </Field>
              )}
            </div>
          )}
        </div>
      </Section>

      <HoldWarningDialog
        open={!!holdWarning}
        reason={holdWarning?.reason ?? ""}
        saving={saving}
        onCancel={() => setHoldWarning(null)}
        onContinue={proceedDespiteHold}
        cancelLabel="Cancel job creation"
      />

      {quickCreateName && (
        <QuickCreateClientModal
          initialName={quickCreateName}
          onCreated={client => {
            setForm(f => ({ ...f, clientId: client.id, clientCompany: client.name }))
            setQuickCreateName("")
          }}
          onClose={() => setQuickCreateName("")}
        />
      )}
    </form>
  )
}
