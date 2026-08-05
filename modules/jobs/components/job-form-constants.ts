import type { ElementType } from "react"
import { PenTool, MapPin, ShieldCheck } from "lucide-react"
import type { JobFormData } from "@/lib/types"
import { OTHER_WORKS_TYPE } from "@/lib/constants"
import { defaultRequiredByDate } from "@/shared/utils/utils"

export const FEATURED_WORKS: { label: string; value: string }[] = [
  { label: "Scaffold", value: "Access Scaffold" },
  { label: "Temporary roof", value: "Temporary Roof" },
  { label: "Hoist", value: "Hoist Tower / Lifting Frame" },
  { label: "Stair tower", value: "Staircase / Tower" },
  { label: "Gantry", value: "Gantry" },
  { label: "Bridge", value: "Bridged Access" },
  { label: "Loading bay", value: "Loading Bay" },
]

export const TYPE_META: Record<string, {
  icon: ElementType
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

export function emptyJobForm(): JobFormData {
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
    visitDate: defaultRequiredByDate(),
    visitStartTime: "09:00",
    visitEndTime: "10:00",
  }
}

export type FieldErrors = Partial<Record<keyof JobFormData, string>>

export function validate(f: JobFormData): FieldErrors {
  const e: FieldErrors = {}
  if (!f.siteName.trim() && !f.siteAddress.trim()) {
    e.siteAddress = "Enter a site name or address"
  }
  if (!f.clientCompany.trim()) e.clientCompany = "Select a client"

  const isSiteVisit = f.itemType === "SITE_VISIT"
  if (!isSiteVisit && !f.requestedBy.trim()) {
    e.requestedBy = "Enter who requested the work"
  }
  if (f.itemType === "DESIGN" && !f.typeOfWorks.trim()) {
    e.typeOfWorks = "Select a type of works"
  }
  if (f.typeOfWorks === OTHER_WORKS_TYPE && !f.customTypeDescription.trim()) {
    e.customTypeDescription = "Describe the type of works"
  }
  if (isSiteVisit) {
    if (!f.visitDate?.trim()) e.visitDate = "Enter the visit date"
    if (!f.visitStartTime?.trim()) e.visitStartTime = "Enter a start time"
    if (!f.visitEndTime?.trim()) e.visitEndTime = "Enter an end time"
    if (
      f.visitStartTime?.trim()
      && f.visitEndTime?.trim()
      && f.visitEndTime.trim() <= f.visitStartTime.trim()
    ) {
      e.visitEndTime = "End time must be after start time"
    }
  }
  return e
}
