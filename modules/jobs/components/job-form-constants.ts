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
    locationType: "SINGLE_PROPERTY",
    siteId: "", siteName: "", siteAddress: "", address: "",
    typeOfWorks: "", customTypeDescription: "", clientCompany: "", clientId: "", requestedBy: "",
    status: "NEW_REQUEST", designer: "", dateCompleted: "", notes: "",
    designStandards: "",
    tags: [],
    quoteValue: "", quoteReference: "", quoteDate: "", commercialNotes: "",
    variationFees: "", additionalCharges: "",
    requiredByDate: defaultRequiredByDate(),
  }
}

export type FieldErrors = Partial<Record<keyof JobFormData, string>>

export function validate(f: JobFormData): FieldErrors {
  const e: FieldErrors = {}
  if (!f.clientCompany.trim()) e.clientCompany = "Select a client"
  if (f.locationType === "MANAGED_SITE") {
    if (!f.siteId.trim()) e.siteId = "Select or create a managed site"
  } else {
    if (!f.siteAddress.trim() && !f.address.trim()) {
      e.siteAddress = "Enter a property address"
    }
  }
  if (!f.requestedBy.trim()) e.requestedBy = "Enter who requested the work"
  if (f.itemType === "DESIGN" && !f.typeOfWorks.trim()) {
    e.typeOfWorks = "Select a type of works"
  }
  if (f.typeOfWorks === OTHER_WORKS_TYPE && !f.customTypeDescription.trim()) {
    e.customTypeDescription = "Describe the type of works"
  }
  return e
}
