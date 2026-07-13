/**
 * Employees module — public API.
 * Import from `@/modules/employees` only; do not reach into subfolders.
 */
export {
  employeeService,
  computeProfileCompletion,
  type EmployeeListItem,
  type EmployeeDetail,
} from "./services/employee-service"

export {
  resolveEmployeeAccess,
  canViewEmployee,
  canViewSalary,
  canManageDocuments,
  canViewDocuments,
  canUploadRestrictedDocuments,
  canViewNotes,
  canEditNotes,
  canViewEmployeePhoto,
  canEditEmployeeField,
  filterPatchByAccess,
  isAdmin,
  EMPLOYEE_SELF_EDIT_FIELDS,
  EMPLOYMENT_ADMIN_FIELDS,
  type EmployeeAccess,
} from "./permissions"

export {
  employeeFilesRoot,
  employeeUserDir,
  safeEmployeeFilename,
  resolveEmployeeFilePath,
  PHOTO_MIME,
  DOC_MIME,
  MAX_PHOTO_BYTES,
  MAX_DOC_BYTES,
} from "./services/employee-files"

export {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_STATUSES,
  SKILL_CATEGORIES,
  DOCUMENT_CATEGORIES,
  type EmploymentType,
  type EmploymentStatus,
  type SkillCategory,
  type DocumentCategory,
  type EmployeeProfileRow,
  type EmployeeSkillRow,
  type EmployeeDocumentRow,
  type EmployeeNoteRow,
  type EmployeeActivityRow,
  type UpdateEmployeeProfileData,
} from "./types"

export { supabaseEmployeeRepo } from "./supabase/repository"

export { default as EmployeeDirectoryPage } from "./components/employee-directory-page"
export { default as EmployeeProfilePage } from "./components/employee-profile-page"
