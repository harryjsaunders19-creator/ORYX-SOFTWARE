import fs from "fs"
import path from "path"

const EMPLOYEE_FILES_DIR = process.env.EMPLOYEE_FILES_DIR
  ?? (process.env.VERCEL ? path.join("/tmp", "employee-files") : path.join(process.cwd(), ".data", "employee-files"))

export function employeeFilesRoot(): string {
  fs.mkdirSync(EMPLOYEE_FILES_DIR, { recursive: true })
  return EMPLOYEE_FILES_DIR
}

export function employeeUserDir(userId: string): string {
  const dir = path.join(employeeFilesRoot(), userId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function safeEmployeeFilename(original: string): string {
  return original.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120)
}

export const PHOTO_MIME = new Set(["image/png", "image/jpeg", "image/webp"])
export const DOC_MIME = new Set([
  ...PHOTO_MIME,
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
])

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const MAX_DOC_BYTES = 15 * 1024 * 1024
