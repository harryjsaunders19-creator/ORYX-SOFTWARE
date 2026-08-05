"use client"
import { Plus, X } from "lucide-react"
import { Input } from "@/shared/ui/input"
import { Button } from "@/shared/ui/button"
import { Field } from "@/shared/ui/field"
import { OTHER_WORKS_TYPE } from "@/lib/constants"
import { cn } from "@/shared/utils"
import { FEATURED_WORKS } from "./job-form-constants"

const controlStyle = { height: "40px" } as const
const controlClass = "h-10"

export interface JobFormWorksTypeProps {
  isDesign: boolean
  typeOfWorks: string
  customTypeDescription: string
  customTypes: string[]
  addingType: boolean
  newTypeLabel: string
  showMoreTypes: boolean
  errors: { typeOfWorks?: string; customTypeDescription?: string }
  selectedWorksLabel: string | null
  selectedNamedCustom: boolean
  moreTypes: string[]
  isWorksSelected: (value: string, custom?: boolean) => boolean
  onSelectWorksType: (value: string, customDescription?: string) => void
  onSetAddingType: (v: boolean) => void
  onSetNewTypeLabel: (v: string) => void
  onCommitNewType: () => void
  onToggleShowMoreTypes: () => void
  onCustomTypeDescriptionChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export function JobFormWorksType({
  isDesign,
  typeOfWorks,
  customTypeDescription,
  customTypes,
  addingType,
  newTypeLabel,
  showMoreTypes,
  errors,
  selectedWorksLabel,
  selectedNamedCustom,
  moreTypes,
  isWorksSelected,
  onSelectWorksType,
  onSetAddingType,
  onSetNewTypeLabel,
  onCommitNewType,
  onToggleShowMoreTypes,
  onCustomTypeDescriptionChange,
}: JobFormWorksTypeProps) {
  return (
    <Field label="Type of works" htmlFor="typeOfWorks" required={isDesign} error={errors.typeOfWorks}>
      <div id="typeOfWorks" className="space-y-3" role="group" aria-label="Type of works">
        <div className="flex flex-wrap gap-2">
          {FEATURED_WORKS.map(chip => {
            const selected = isWorksSelected(chip.value)
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => onSelectWorksType(chip.value)}
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
                onClick={() => onSelectWorksType(OTHER_WORKS_TYPE, label)}
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
              onClick={() => onSetAddingType(true)}
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
                onChange={e => onSetNewTypeLabel(e.target.value)}
                placeholder="New type of works…"
                autoFocus
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    onCommitNewType()
                  }
                  if (e.key === "Escape") {
                    onSetAddingType(false)
                    onSetNewTypeLabel("")
                  }
                }}
              />
              <Button type="button" size="sm" variant="primary" onClick={onCommitNewType}>
                Add
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => { onSetAddingType(false); onSetNewTypeLabel("") }}
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
            onClick={onToggleShowMoreTypes}
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
                  onClick={() => onSelectWorksType(value)}
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
              onClick={() => onSelectWorksType(OTHER_WORKS_TYPE, "")}
              aria-pressed={typeOfWorks === OTHER_WORKS_TYPE && !selectedNamedCustom}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                typeOfWorks === OTHER_WORKS_TYPE && !selectedNamedCustom
                  ? "border-rs-bd bg-rs-bg text-rs-tx"
                  : "border-bd bg-sr text-t2 hover:border-bds",
              )}
            >
              Other…
            </button>
          </div>
        )}

        {typeOfWorks === OTHER_WORKS_TYPE && !selectedNamedCustom && (
          <Field label="Describe type of works" htmlFor="customTypeDescription" required error={errors.customTypeDescription}>
            <Input
              className={controlClass}
              style={controlStyle}
              value={customTypeDescription}
              onChange={onCustomTypeDescriptionChange}
              placeholder="e.g. Temporary pedestrian tunnel"
              autoComplete="off"
            />
          </Field>
        )}
      </div>
    </Field>
  )
}
