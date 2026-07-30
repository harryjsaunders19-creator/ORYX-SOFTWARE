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
  WORKS_TYPES, JOB_TAGS,
} from "@/lib/constants"
import { ClientCombobox } from "@/components/client-combobox"
import { DesignerCombobox } from "@/components/designer-combobox"
import { QuickCreateClientModal } from "@/components/quick-create-client-modal"
import { SiteSelector, CreateSiteDialog, formatSiteAddress } from "@/modules/sites/client"
import type { SiteSummary } from "@/modules/sites/client"
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
      locationType: job.siteId ? "MANAGED_SITE" : "SINGLE_PROPERTY",
      siteId: job.siteId ?? "",
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
  const [createSiteOpen, setCreateSiteOpen] = useState(false)
  const [holdWarning, setHoldWarning] = useState<{ reason: string; pendingSubmit: JobFormData } | null>(null)
  const [customTypes, setCustomTypes] = useState<string[]>([])
  const [addingType, setAddingType] = useState(false)
  const [newTypeLabel, setNewTypeLabel] = useState("")
  const [showMoreTypes, setShowMoreTypes] = useState(false)

  const applySite = (site: SiteSummary | null) => {
    if (!site) {
      setForm(f => ({ ...f, siteId: "", siteName: "", siteAddress: "", address: "" }))
      return
    }
    const addr = formatSiteAddress(site)
    setForm(f => ({
      ...f,
      locationType: "MANAGED_SITE",
      siteId: site.id,
      siteName: site.name,
      siteAddress: addr || site.name,
      address: addr || site.name,
    }))
    setErrors(prev => ({ ...prev, siteId: undefined }))
  }

  const setLocationType = (locationType: JobFormData["locationType"]) => {
    setForm(f => {
      if (locationType === "SINGLE_PROPERTY") {
        return {
          ...f,
          locationType,
          siteId: "",
          // Keep any typed property name/address already entered when switching back.
        }
      }
      return {
        ...f,
        locationType,
        siteName: f.siteId ? f.siteName : "",
        siteAddress: f.siteId ? f.siteAddress : "",
        address: f.siteId ? f.address : "",
      }
    })
    setErrors(prev => ({ ...prev, siteId: undefined, siteAddress: undefined }))
  }

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
      const isManaged = form.locationType === "MANAGED_SITE"
      await onSubmit({
        ...form,
        siteId: isManaged ? form.siteId : "",
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
    const pending = holdWarning.pendingSubmit
    setHoldWarning(null)
    setSaving(true)
    try {
      const isManaged = pending.locationType === "MANAGED_SITE"
      await onSubmit({
        ...pending,
        siteId: isManaged ? pending.siteId : "",
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

      {/* 2 · Client → Location → Description of Works */}
      <Section
        step={job ? 1 : 2}
        title="Client & Location"
        question="Who is the client, and where is the work taking place?"
      >
        <div className="space-y-4">
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
                    // Clear managed site when client changes — sites are client-scoped.
                    siteId: "",
                    ...(f.locationType === "MANAGED_SITE"
                      ? { siteName: "", siteAddress: "", address: "" }
                      : {}),
                    requestedBy: !f.requestedBy.trim() && contactName ? contactName : f.requestedBy,
                  }))
                  setErrors(prev => ({ ...prev, clientCompany: undefined, siteId: undefined }))
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

          <Field
            label="Location Type"
            hint="Single Property for one-off jobs. Managed Site when several jobs may share a long-term location."
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {([
                {
                  value: "SINGLE_PROPERTY" as const,
                  title: "Single Property",
                  description: "One-off domestic or commercial job — address stored on this job only.",
                },
                {
                  value: "MANAGED_SITE" as const,
                  title: "Managed Site",
                  description: "Reusable location under the client — multiple jobs over time.",
                },
              ]).map(opt => {
                const selected = form.locationType === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLocationType(opt.value)}
                    aria-pressed={selected}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-left transition-colors",
                      selected
                        ? "border-rs-bd bg-rs-bg text-rs-tx"
                        : "border-bd bg-sr text-t2 hover:border-bds hover:text-t1",
                    )}
                  >
                    <span className="block text-sm font-semibold">{opt.title}</span>
                    <span className="mt-0.5 block text-xs opacity-80">{opt.description}</span>
                  </button>
                )
              })}
            </div>
          </Field>

          {form.locationType === "MANAGED_SITE" ? (
            <Field
              label="Managed Site"
              required
              error={errors.siteId}
              hint="Reusable location under this client"
            >
              <SiteSelector
                clientId={form.clientId}
                value={form.siteId}
                name={form.siteName}
                onChange={applySite}
                onCreateNew={() => setCreateSiteOpen(true)}
                error={errors.siteId}
              />
            </Field>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Property Name" hint="Optional building or property description">
                <Input
                  className={controlClass}
                  style={controlStyle}
                  value={form.siteName}
                  onChange={e => {
                    const siteName = e.target.value
                    setForm(f => ({
                      ...f,
                      siteName,
                      address: composeJobAddress(siteName, f.siteAddress, f.address),
                    }))
                  }}
                  placeholder="e.g. 14 Church Lane"
                  autoComplete="off"
                />
              </Field>
              <Field label="Property Address" required error={errors.siteAddress}>
                <Input
                  className={controlClass}
                  style={controlStyle}
                  value={form.siteAddress}
                  onChange={e => {
                    const siteAddress = e.target.value
                    setForm(f => ({
                      ...f,
                      siteAddress,
                      address: composeJobAddress(f.siteName, siteAddress, siteAddress),
                    }))
                    if (errors.siteAddress) setErrors(prev => ({ ...prev, siteAddress: undefined }))
                  }}
                  placeholder="Street, town, postcode"
                  autoComplete="off"
                />
              </Field>
            </div>
          )}

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

          <Field label="Description of Works" hint="Job-specific scope for this design commission">
            <Textarea
              value={form.notes}
              onChange={setF("notes")}
              placeholder={
                isSiteVisit
                  ? "Visit purpose, contacts on site, access notes…"
                  : isCatIii
                    ? "Check brief, drawing references, standards to apply…"
                    : "e.g. Bridged access scaffold over the station entrance"
              }
              rows={3}
            />
          </Field>
        </div>
      </Section>

      <Divider />

      {/* 3 · Assignment */}
      <Section
        step={job ? 2 : 3}
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

      {/* 4 · Additional */}
      <Section
        step={job ? 3 : 4}
        title="Additional information"
        question="Optional tags and commercial references."
      >
        <div className="space-y-4">
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
            setForm(f => ({
              ...f,
              clientId: client.id,
              clientCompany: client.name,
              siteId: "",
              siteName: "",
              siteAddress: "",
              address: "",
            }))
            setQuickCreateName("")
          }}
          onClose={() => setQuickCreateName("")}
        />
      )}

      {createSiteOpen && form.clientId && (
        <CreateSiteDialog
          clientId={form.clientId}
          clientName={form.clientCompany}
          onCreated={site => {
            applySite(site)
            setCreateSiteOpen(false)
          }}
          onUseExisting={site => {
            applySite(site)
            setCreateSiteOpen(false)
          }}
          onClose={() => setCreateSiteOpen(false)}
        />
      )}
    </form>
  )
}
