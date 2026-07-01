import type {
  EmployeeActivityRow,
  EmployeeDocumentRow,
  EmployeeNoteRow,
  EmployeeProfileRow,
  EmployeeSkillRow,
} from "@/modules/employees/types/employee-types"

export interface SupabaseEmployeeProfileRow {
  user_id: string
  employee_id: string | null
  profile_photo_path: string | null
  first_name: string | null
  last_name: string | null
  preferred_name: string | null
  phone: string | null
  mobile: string | null
  date_of_birth: string | null
  gender: string | null
  nationality: string | null
  address: string | null
  city: string | null
  county: string | null
  postcode: string | null
  country: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_relationship: string | null
  job_title: string | null
  department: string | null
  manager_id: string | null
  office_location: string | null
  employment_type: string
  employment_status: string
  start_date: string | null
  end_date: string | null
  probation_end_date: string | null
  working_hours: string | null
  salary: number | null
  annual_leave_allowance: number
  leave_taken: number
  created_at: string
  updated_at: string
}

export function toEmployeeProfileRow(row: SupabaseEmployeeProfileRow): EmployeeProfileRow {
  return {
    userId: row.user_id,
    employeeId: row.employee_id,
    profilePhotoPath: row.profile_photo_path,
    firstName: row.first_name,
    lastName: row.last_name,
    preferredName: row.preferred_name,
    phone: row.phone,
    mobile: row.mobile,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    nationality: row.nationality,
    address: row.address,
    city: row.city,
    county: row.county,
    postcode: row.postcode,
    country: row.country,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactPhone: row.emergency_contact_phone,
    emergencyContactRelationship: row.emergency_contact_relationship,
    jobTitle: row.job_title,
    department: row.department,
    managerId: row.manager_id,
    officeLocation: row.office_location,
    employmentType: row.employment_type as EmployeeProfileRow["employmentType"],
    employmentStatus: row.employment_status as EmployeeProfileRow["employmentStatus"],
    startDate: row.start_date,
    endDate: row.end_date,
    probationEndDate: row.probation_end_date,
    workingHours: row.working_hours,
    salary: row.salary,
    annualLeaveAllowance: row.annual_leave_allowance,
    leaveTaken: row.leave_taken,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toSupabaseEmployeeProfileRow(row: EmployeeProfileRow): SupabaseEmployeeProfileRow {
  return {
    user_id: row.userId,
    employee_id: row.employeeId,
    profile_photo_path: row.profilePhotoPath,
    first_name: row.firstName,
    last_name: row.lastName,
    preferred_name: row.preferredName,
    phone: row.phone,
    mobile: row.mobile,
    date_of_birth: row.dateOfBirth,
    gender: row.gender,
    nationality: row.nationality,
    address: row.address,
    city: row.city,
    county: row.county,
    postcode: row.postcode,
    country: row.country,
    emergency_contact_name: row.emergencyContactName,
    emergency_contact_phone: row.emergencyContactPhone,
    emergency_contact_relationship: row.emergencyContactRelationship,
    job_title: row.jobTitle,
    department: row.department,
    manager_id: row.managerId,
    office_location: row.officeLocation,
    employment_type: row.employmentType,
    employment_status: row.employmentStatus,
    start_date: row.startDate,
    end_date: row.endDate,
    probation_end_date: row.probationEndDate,
    working_hours: row.workingHours,
    salary: row.salary,
    annual_leave_allowance: row.annualLeaveAllowance,
    leave_taken: row.leaveTaken,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

export function toEmployeeSkillRow(row: Record<string, unknown>): EmployeeSkillRow {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    level: row.level as string | null,
    yearsExperience: row.years_experience as number | null,
    category: row.category as EmployeeSkillRow["category"],
    certificatePath: row.certificate_path as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function toSupabaseEmployeeSkillRow(row: EmployeeSkillRow) {
  return {
    id: row.id,
    user_id: row.userId,
    name: row.name,
    level: row.level,
    years_experience: row.yearsExperience,
    category: row.category,
    certificate_path: row.certificatePath,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

export function toEmployeeDocumentRow(row: Record<string, unknown>): EmployeeDocumentRow {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    category: row.category as EmployeeDocumentRow["category"],
    filePath: row.file_path as string,
    mimeType: row.mime_type as string,
    fileSize: row.file_size as number,
    restricted: (row.restricted as boolean) ? 1 : 0,
    uploadedBy: row.uploaded_by as string,
    uploadedByName: row.uploaded_by_name as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function toSupabaseEmployeeDocumentRow(row: EmployeeDocumentRow) {
  return {
    id: row.id,
    user_id: row.userId,
    name: row.name,
    category: row.category,
    file_path: row.filePath,
    mime_type: row.mimeType,
    file_size: row.fileSize,
    restricted: row.restricted === 1,
    uploaded_by: row.uploadedBy,
    uploaded_by_name: row.uploadedByName,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

export function toEmployeeNoteRow(row: Record<string, unknown>): EmployeeNoteRow {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    content: row.content as string,
    createdBy: row.created_by as string,
    createdByName: row.created_by_name as string,
    updatedBy: row.updated_by as string | null,
    updatedByName: row.updated_by_name as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function toSupabaseEmployeeNoteRow(row: EmployeeNoteRow) {
  return {
    id: row.id,
    user_id: row.userId,
    content: row.content,
    created_by: row.createdBy,
    created_by_name: row.createdByName,
    updated_by: row.updatedBy,
    updated_by_name: row.updatedByName,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

export function toEmployeeActivityRow(row: Record<string, unknown>): EmployeeActivityRow {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    action: row.action as string,
    detail: row.detail as string | null,
    performedBy: row.performed_by as string,
    performedByName: row.performed_by_name as string,
    createdAt: row.created_at as string,
  }
}

export function toSupabaseEmployeeActivityRow(row: EmployeeActivityRow) {
  return {
    id: row.id,
    user_id: row.userId,
    action: row.action,
    detail: row.detail,
    performed_by: row.performedBy,
    performed_by_name: row.performedByName,
    created_at: row.createdAt,
  }
}
