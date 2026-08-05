"use client"

import { useEffect, useMemo, useState } from "react"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import { Field } from "@/shared/ui/field"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/ui/select"
import {
  JOB_STATUSES, CREATABLE_ITEM_TYPES, OTHER_WORKS_TYPE,
  WORKS_TYPES, JOB_TAGS, JOB_TAG_MAX_LEN, normalizeJobTag,
} from "@/lib/constants"
import { ClientCombobox } from "@/components/client-combobox"
import { DesignerCombobox } from "@/components/designer-combobox"
import { QuickCreateClientModal } from "@/components/quick-create-client-modal"
import { HoldWarningDialog } from "@/shared/ui/hold-warning-dialog"
import { cn } from "@/shared/utils"
import type { Job, JobFormData } from "@/lib/types"
import { composeJobAddress } from "@/modules/job-map/utils/job-address"
import { addCustomWorksType, readCustomWorksTypes } from "./custom-works-types"
import { worksTypeDisplayLabel } from "@/lib/constants"
import { emptyJobForm, validate, FEATURED_WORKS } from "./job-form-constants"
import type { FieldErrors } from "./job-form-constants"
import { Section, Divider } from "./job-form-layout"
import { JobFormItemType } from "./job-form-item-type"
import { JobFormWorksType } from "./job-form-works-type"

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
  const [addingTag, setAddingTag] = useState(false)
  const [newTagLabel, setNewTagLabel] = useState("")
  const [tagError, setTagError] = useState<string | null>(null)

  useEffect(() => {
    const saved = readCustomWorksTypes()
    // Surface the job's custom description as a chip when editing.
    if (job?.typeOfWorks === OTHER_WORKS_TYPE && job.customTypeDescription?.trim()) {
      setCustomTypes(addCustomWorksType(job.customTypeDescription.trim()))
    } else {
      setCustomTypes(saved)
    }
  }, [job?.id, job?.typeOfWorks, job?.customTypeDescription])

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
    return worksTypeDisplayLabel(form.typeOfWorks, form.customTypeDescription) || null
  }, [form.typeOfWorks, form.customTypeDescription])

  /** True when Other is selected via a named custom chip (not freeform Other…). */
  const selectedNamedCustom = useMemo(() => {
    if (form.typeOfWorks !== OTHER_WORKS_TYPE || !form.customTypeDescription.trim()) return false
    return customTypes.some(
      t => t.toLowerCase() === form.customTypeDescription.trim().toLowerCase(),
    )
  }, [form.typeOfWorks, form.customTypeDescription, customTypes])

  const selectWorksType = (value: string, customDescription?: string) => {
    if (value === OTHER_WORKS_TYPE) {
      setForm(f => ({
        ...f,
        typeOfWorks: OTHER_WORKS_TYPE,
        // Explicit "" clears for freeform Other…; omit arg to keep existing text.
        customTypeDescription: customDescription !== undefined ? customDescription : f.customTypeDescription,
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
    setTagError(null)
  }

  const customTags = form.tags.filter(
    tag => !(JOB_TAGS as readonly string[]).includes(tag),
  )

  const commitNewTag = () => {
    const normalized = normalizeJobTag(newTagLabel)
    if (!normalized) {
      setTagError(newTagLabel.trim() ? `Tag must be 1–${JOB_TAG_MAX_LEN} characters` : "Enter a tag name")
      return
    }
    const existing = form.tags.find(t => t.toLowerCase() === normalized.toLowerCase())
    if (existing) {
      // Already selected — just close the adder.
      setAddingTag(false)
      setNewTagLabel("")
      setTagError(null)
      return
    }
    const preset = JOB_TAGS.find(p => p.toLowerCase() === normalized.toLowerCase())
    setForm(f => ({ ...f, tags: [...f.tags, preset ?? normalized] }))
    setAddingTag(false)
    setNewTagLabel("")
    setTagError(null)
  }

  return (
    <form id={formId} onSubmit={handleSubmit} noValidate data-saving={saving ? "true" : undefined} className="space-y-8">
      {job && (
        <div className="flex items-center gap-3 rounded-xl border border-bd bg-pg px-4 py-3">
          <span className="text-xs text-t3 shrink-0">Reference</span>
          <span className="type-drawing-number text-sm font-semibold text-t1">{job.drawingNumber}</span>
        </div>
      )}

      {/* 1 · What are you creating? */}
      {!job && (
        <>
          <Section step={1} title="What are you creating?" question="Choose the work item type to start.">
            <JobFormItemType
              selectableTypes={selectableTypes}
              selectedItemType={form.itemType}
              onSelect={itemType => {
                setForm(f => ({
                  ...f,
                  itemType,
                  ...(itemType !== "DESIGN"
                    ? { typeOfWorks: "", customTypeDescription: "" }
                    : {}),
                }))
                setErrors(prev => ({
                  ...prev,
                  typeOfWorks: undefined,
                  customTypeDescription: undefined,
                }))
              }}
            />
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
            <JobFormWorksType
              isDesign={isDesign}
              typeOfWorks={form.typeOfWorks}
              customTypeDescription={form.customTypeDescription}
              customTypes={customTypes}
              addingType={addingType}
              newTypeLabel={newTypeLabel}
              showMoreTypes={showMoreTypes}
              errors={errors}
              selectedWorksLabel={selectedWorksLabel}
              selectedNamedCustom={selectedNamedCustom}
              moreTypes={moreTypes}
              isWorksSelected={isWorksSelected}
              onSelectWorksType={selectWorksType}
              onSetAddingType={setAddingType}
              onSetNewTypeLabel={setNewTypeLabel}
              onCommitNewType={commitNewType}
              onToggleShowMoreTypes={() => setShowMoreTypes(v => !v)}
              onCustomTypeDescriptionChange={setF("customTypeDescription")}
            />
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
            hint="Optional labels for search and filtering — pick presets or add your own."
            error={tagError ?? undefined}
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
              {customTags.map(tag => (
                <button
                  key={`custom-${tag}`}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  aria-pressed={true}
                  className="rounded-lg border border-rs-bd bg-rs-bg px-3 py-2 text-sm font-medium text-rs-tx transition-colors duration-150"
                  title="Click to remove"
                >
                  {tag}
                </button>
              ))}
              {!addingTag ? (
                <button
                  type="button"
                  onClick={() => { setAddingTag(true); setTagError(null) }}
                  className="rounded-lg border border-dashed border-bd bg-sr px-3 py-2 text-sm font-medium text-t3 transition-colors duration-150 hover:border-bds hover:text-t1"
                >
                  + Add tag
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="h-10 w-44"
                    style={{ height: "40px" }}
                    value={newTagLabel}
                    onChange={e => { setNewTagLabel(e.target.value); setTagError(null) }}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        commitNewTag()
                      }
                      if (e.key === "Escape") {
                        setAddingTag(false)
                        setNewTagLabel("")
                        setTagError(null)
                      }
                    }}
                    placeholder="Custom tag"
                    maxLength={JOB_TAG_MAX_LEN}
                    autoFocus
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={commitNewTag}
                    className="rounded-lg border border-rs-bd bg-rs-bg px-3 py-2 text-sm font-medium text-rs-tx"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAddingTag(false); setNewTagLabel(""); setTagError(null) }}
                    className="rounded-lg border border-bd bg-sr px-3 py-2 text-sm font-medium text-t3"
                  >
                    Cancel
                  </button>
                </div>
              )}
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
