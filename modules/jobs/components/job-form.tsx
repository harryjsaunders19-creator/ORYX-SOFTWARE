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
import { CreateSiteDialog, formatSiteAddress, LocationSearch } from "@/modules/sites/client"
import type { SiteSummary } from "@/modules/sites/client"
import type { LocationSelection } from "@/modules/sites/components/location-search"
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
      locationMode: job.siteId || job.locationMode === "MANAGED_SITE" ? "MANAGED_SITE" : "ONE_OFF",
      siteId: job.siteId ?? "",
      locationName: job.locationName ?? job.siteName ?? "",
      address: job.address,
      postcode: job.postcode ?? "",
      siteName: job.siteName ?? job.locationName ?? "",
      siteAddress: job.siteAddress ?? job.address ?? "",
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
  const [promoteOpen, setPromoteOpen] = useState<{
    locationName: string
    address: string
    postcode: string
    jobIds: string[]
  } | null>(null)
  const [holdWarning, setHoldWarning] = useState<{ reason: string; pendingSubmit: JobFormData } | null>(null)
  const [customTypes, setCustomTypes] = useState<string[]>([])
  const [addingType, setAddingType] = useState(false)
  const [newTypeLabel, setNewTypeLabel] = useState("")
  const [showMoreTypes, setShowMoreTypes] = useState(false)

  const applyLocation = (loc: LocationSelection) => {
    setForm(f => ({
      ...f,
      locationMode: loc.locationMode,
      siteId: loc.siteId,
      locationName: loc.locationName,
      address: loc.address || composeJobAddress(loc.locationName, loc.address),
      postcode: loc.postcode,
      siteName: loc.locationName,
      siteAddress: loc.address,
    }))
    setErrors(prev => ({ ...prev, address: undefined, siteId: undefined }))
  }

  const applySite = (site: SiteSummary | null) => {
    if (!site) {
      applyLocation({
        locationMode: "ONE_OFF",
        siteId: "",
        locationName: "",
        address: "",
        postcode: "",
      })
      return
    }
    const addr = formatSiteAddress(site)
    applyLocation({
      locationMode: "MANAGED_SITE",
      siteId: site.id,
      locationName: site.name,
      address: addr || site.name,
      postcode: site.postcode ?? "",
    })
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
      const isManaged = form.locationMode === "MANAGED_SITE"
      await onSubmit({
        ...form,
        locationMode: isManaged ? "MANAGED_SITE" : "ONE_OFF",
        siteId: isManaged ? form.siteId : "",
        locationName: form.locationName || form.siteName,
        siteName: form.locationName || form.siteName,
        siteAddress: form.address || form.siteAddress,
        address: form.address || composeJobAddress(form.locationName || form.siteName, form.siteAddress, form.address),
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
      const isManaged = pending.locationMode === "MANAGED_SITE"
      await onSubmit({
        ...pending,
        locationMode: isManaged ? "MANAGED_SITE" : "ONE_OFF",
        siteId: isManaged ? pending.siteId : "",
        locationName: pending.locationName || pending.siteName,
        siteName: pending.locationName || pending.siteName,
        siteAddress: pending.address || pending.siteAddress,
        address: pending.address || composeJobAddress(pending.locationName || pending.siteName, pending.siteAddress, pending.address),
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
                    // Clear location when client changes — sites are client-scoped.
                    siteId: "",
                    locationMode: "ONE_OFF",
                    locationName: "",
                    siteName: "",
                    siteAddress: "",
                    address: "",
                    postcode: "",
                    requestedBy: !f.requestedBy.trim() && contactName ? contactName : f.requestedBy,
                  }))
                  setErrors(prev => ({ ...prev, clientCompany: undefined, address: undefined }))
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
            label="Location"
            required
            error={errors.address}
            hint="Search an existing site or address — or type a new one for a one-off job"
          >
            <LocationSearch
              clientId={form.clientId}
              value={{
                locationMode: form.locationMode,
                siteId: form.siteId,
                locationName: form.locationName || form.siteName,
                address: form.address || form.siteAddress,
                postcode: form.postcode,
              }}
              onChange={applyLocation}
              onCreateManagedSite={() => {
                if (!form.clientId) return
                setCreateSiteOpen(true)
              }}
              onPromoteSuggestion={hit => {
                setPromoteOpen({
                  locationName: hit.locationName,
                  address: hit.address,
                  postcode: hit.postcode ?? "",
                  jobIds: hit.sampleJobIds,
                })
              }}
              error={errors.address}
            />
          </Field>

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

      {promoteOpen && form.clientId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-bd bg-sr p-5 shadow-xl">
            <h3 className="text-base font-semibold text-t1">Create Managed Site?</h3>
            <p className="mt-2 text-sm text-t2">
              This location already contains multiple jobs. Creating a Managed Site keeps them
              linked under one reusable location — without changing drawing numbers, revisions,
              quotations or CATII checks.
            </p>
            <p className="mt-3 text-sm font-medium text-t1">
              {promoteOpen.locationName || promoteOpen.address}
            </p>
            {promoteOpen.address && promoteOpen.locationName !== promoteOpen.address && (
              <p className="text-xs text-t3">{promoteOpen.address}</p>
            )}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-lg border border-bd px-3 py-2 text-sm text-t2 hover:bg-pg"
                onClick={() => setPromoteOpen(null)}
              >
                Continue as One-Off Job
              </button>
              <button
                type="button"
                className="rounded-lg bg-ac px-3 py-2 text-sm font-medium text-white hover:bg-ach"
                onClick={async () => {
                  const payload = promoteOpen
                  setPromoteOpen(null)
                  try {
                    const res = await fetch("/api/sites/promote", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        clientId: form.clientId,
                        name: payload.locationName || payload.address,
                        address: payload.address,
                        postcode: payload.postcode || null,
                        jobIds: [
                          ...payload.jobIds,
                          ...(job?.id ? [job.id] : []),
                        ],
                      }),
                    })
                    const body = await res.json() as {
                      site?: SiteSummary
                      error?: string
                      detail?: string
                    }
                    if (!res.ok || !body.site) {
                      setErrors(prev => ({
                        ...prev,
                        address: body.detail || body.error || "Failed to create managed site",
                      }))
                      return
                    }
                    applySite(body.site)
                  } catch {
                    setErrors(prev => ({ ...prev, address: "Network error" }))
                  }
                }}
              >
                Create Managed Site
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}
