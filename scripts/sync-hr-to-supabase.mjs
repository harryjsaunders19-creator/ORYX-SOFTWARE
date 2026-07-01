/**
 * Copy employee + leave tables from SQLite → Supabase.
 *
 * Usage: npm run supabase:sync-employees
 *        npm run supabase:sync-leave
 */
import { existsSync } from "fs"
import { join } from "path"
import { createRequire } from "module"
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, projectRoot } from "./load-env-local.mjs"

const require = createRequire(import.meta.url)
loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !key) {
  console.error("Missing Supabase env vars")
  process.exit(1)
}

const dbPath = process.env.DB_PATH ?? join(projectRoot, ".data", "oryx.db")
if (!existsSync(dbPath)) {
  console.error("SQLite database not found")
  process.exit(1)
}

const Database = require("better-sqlite3")
const db = new Database(dbPath, { readonly: true })
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const mode = process.argv[2] ?? "all"
let failed = 0

async function syncEmployees() {
  const profiles = db.prepare("SELECT * FROM EmployeeProfile").all()
  console.log(`Syncing ${profiles.length} employee profile(s)...`)
  for (const p of profiles) {
    const { error } = await supabase.from("employee_profiles").upsert({
      user_id: p.userId,
      employee_id: p.employeeId,
      profile_photo_path: p.profilePhotoPath,
      first_name: p.firstName,
      last_name: p.lastName,
      preferred_name: p.preferredName,
      phone: p.phone,
      mobile: p.mobile,
      date_of_birth: p.dateOfBirth,
      gender: p.gender,
      nationality: p.nationality,
      address: p.address,
      city: p.city,
      county: p.county,
      postcode: p.postcode,
      country: p.country,
      emergency_contact_name: p.emergencyContactName,
      emergency_contact_phone: p.emergencyContactPhone,
      emergency_contact_relationship: p.emergencyContactRelationship,
      job_title: p.jobTitle,
      department: p.department,
      manager_id: p.managerId,
      office_location: p.officeLocation,
      employment_type: p.employmentType,
      employment_status: p.employmentStatus,
      start_date: p.startDate,
      end_date: p.endDate,
      probation_end_date: p.probationEndDate,
      working_hours: p.workingHours,
      salary: p.salary,
      annual_leave_allowance: p.annualLeaveAllowance,
      leave_taken: p.leaveTaken,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    }, { onConflict: "user_id" })
    if (error) { console.error("  profile", p.userId, error.message); failed++ }
  }

  for (const table of ["EmployeeSkill", "EmployeeDocument", "EmployeeNote", "EmployeeActivity"]) {
    const rows = db.prepare(`SELECT * FROM ${table}`).all()
    const target = {
      EmployeeSkill: "employee_skills",
      EmployeeDocument: "employee_documents",
      EmployeeNote: "employee_notes",
      EmployeeActivity: "employee_activity",
    }[table]
    console.log(`Syncing ${rows.length} ${table} row(s)...`)
    for (const r of rows) {
      let payload: Record<string, unknown>
      if (table === "EmployeeSkill") {
        payload = {
          id: r.id, user_id: r.userId, name: r.name, level: r.level,
          years_experience: r.yearsExperience, category: r.category,
          certificate_path: r.certificatePath, created_at: r.createdAt, updated_at: r.updatedAt,
        }
      } else if (table === "EmployeeDocument") {
        payload = {
          id: r.id, user_id: r.userId, name: r.name, category: r.category,
          file_path: r.filePath, mime_type: r.mimeType, file_size: r.fileSize,
          restricted: r.restricted === 1, uploaded_by: r.uploadedBy,
          uploaded_by_name: r.uploadedByName, created_at: r.createdAt, updated_at: r.updatedAt,
        }
      } else if (table === "EmployeeNote") {
        payload = {
          id: r.id, user_id: r.userId, content: r.content, created_by: r.createdBy,
          created_by_name: r.createdByName, updated_by: r.updatedBy,
          updated_by_name: r.updatedByName, created_at: r.createdAt, updated_at: r.updatedAt,
        }
      } else {
        payload = {
          id: r.id, user_id: r.userId, action: r.action, detail: r.detail,
          performed_by: r.performedBy, performed_by_name: r.performedByName,
          created_at: r.createdAt,
        }
      }
      const { error } = await supabase.from(target).upsert(payload, { onConflict: "id" })
      if (error) { console.error(`  ${table}`, r.id, error.message); failed++ }
    }
  }
}

async function syncLeave() {
  const requests = db.prepare("SELECT * FROM LeaveRequest").all()
  console.log(`Syncing ${requests.length} leave request(s)...`)
  for (const r of requests) {
    const { error } = await supabase.from("leave_requests").upsert({
      id: r.id,
      user_id: r.userId,
      leave_type: r.leaveType,
      start_date: r.startDate,
      end_date: r.endDate,
      reason: r.reason,
      status: r.status,
      reviewed_by: r.reviewedBy,
      reviewed_by_name: r.reviewedByName,
      reviewed_at: r.reviewedAt,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
    }, { onConflict: "id" })
    if (error) { console.error("  leave", r.id, error.message); failed++ }
  }

  const links = db.prepare("SELECT * FROM LeaveCalendarLink").all()
  console.log(`Syncing ${links.length} leave calendar link(s)...`)
  for (const l of links) {
    const { error } = await supabase.from("leave_calendar_links").upsert({
      leave_request_id: l.leaveRequestId,
      calendar_event_id: l.calendarEventId,
      user_id: l.userId,
      status: l.status,
      created_at: l.createdAt,
      updated_at: l.updatedAt,
    }, { onConflict: "leave_request_id" })
    if (error) { console.error("  link", l.leaveRequestId, error.message); failed++ }
  }

  const { error: catErr } = await supabase.from("event_categories").upsert({
    id: "cat_annual_leave", name: "Annual Leave", color: "#15803D", icon: "calendar-off",
  }, { onConflict: "id" })
  if (catErr) { console.error("  cat_annual_leave", catErr.message); failed++ }
}

if (mode === "employees" || mode === "all") await syncEmployees()
if (mode === "leave" || mode === "all") await syncLeave()

console.log(failed ? `\nFinished with ${failed} error(s)` : "\nDone.")
process.exit(failed ? 1 : 0)
