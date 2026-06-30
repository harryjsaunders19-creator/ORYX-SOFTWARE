/** Employee HR profile — 1:1 extension of User (auth directory). */

export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACTOR", "TEMPORARY"] as const
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]

export const EMPLOYMENT_STATUSES = ["ACTIVE", "ON_LEAVE", "SUSPENDED", "FORMER"] as const
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number]

export const SKILL_CATEGORIES = ["SKILL", "QUALIFICATION", "TRAINING", "LICENCE", "CERTIFICATE"] as const
export type SkillCategory = (typeof SKILL_CATEGORIES)[number]

export const DOCUMENT_CATEGORIES = [
  "EMPLOYMENT_CONTRACT",
  "PASSPORT",
  "DRIVING_LICENCE",
  "RIGHT_TO_WORK",
  "CERTIFICATE",
  "OTHER",
] as const
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]

export interface EmployeeProfileRow {
  userId: string
  employeeId: string | null
  profilePhotoPath: string | null
  firstName: string | null
  lastName: string | null
  preferredName: string | null
  phone: string | null
  mobile: string | null
  dateOfBirth: string | null
  gender: string | null
  nationality: string | null
  address: string | null
  city: string | null
  county: string | null
  postcode: string | null
  country: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  emergencyContactRelationship: string | null
  jobTitle: string | null
  department: string | null
  managerId: string | null
  officeLocation: string | null
  employmentType: EmploymentType
  employmentStatus: EmploymentStatus
  startDate: string | null
  endDate: string | null
  probationEndDate: string | null
  workingHours: string | null
  salary: number | null
  annualLeaveAllowance: number
  leaveTaken: number
  createdAt: string
  updatedAt: string
}

export interface EmployeeSkillRow {
  id: string
  userId: string
  name: string
  level: string | null
  yearsExperience: number | null
  category: SkillCategory
  certificatePath: string | null
  createdAt: string
  updatedAt: string
}

export interface EmployeeDocumentRow {
  id: string
  userId: string
  name: string
  category: DocumentCategory
  filePath: string
  mimeType: string
  fileSize: number
  restricted: number
  uploadedBy: string
  uploadedByName: string
  createdAt: string
  updatedAt: string
}

export interface EmployeeNoteRow {
  id: string
  userId: string
  content: string
  createdBy: string
  createdByName: string
  updatedBy: string | null
  updatedByName: string | null
  createdAt: string
  updatedAt: string
}

export interface EmployeeActivityRow {
  id: string
  userId: string
  action: string
  detail: string | null
  performedBy: string
  performedByName: string
  createdAt: string
}

export type UpdateEmployeeProfileData = Partial<Omit<EmployeeProfileRow,
  "userId" | "createdAt" | "updatedAt"
>>
