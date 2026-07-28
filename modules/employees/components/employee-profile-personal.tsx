"use client"
import { format } from "date-fns"
import { Button } from "@/shared/ui/button"
import { DetailPanel } from "@/shared/layouts/page-layout"
import { Row, EMP_TYPE_LABELS } from "./employee-profile-primitives"
import type { EmployeeDetail } from "../services/employee-service"
import type { EmployeeAccess } from "../permissions"

export function PersonalPanel({
  emp, access, isSelf,
}: {
  emp: EmployeeDetail
  access: EmployeeAccess
  isSelf: boolean
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <DetailPanel title="Contact">
        <dl className="space-y-2 text-sm">
          <Row label="Email" value={emp.email} />
          <Row label="Phone" value={emp.profile.phone} />
          <Row label="Mobile" value={emp.profile.mobile} />
          <Row label="Preferred name" value={emp.profile.preferredName} />
        </dl>
      </DetailPanel>
      <DetailPanel title="Address">
        <dl className="space-y-2 text-sm">
          <Row label="Address" value={emp.profile.address} />
          <Row label="City" value={emp.profile.city} />
          <Row label="County" value={emp.profile.county} />
          <Row label="Postcode" value={emp.profile.postcode} />
          <Row label="Country" value={emp.profile.country} />
        </dl>
      </DetailPanel>
      {(access !== "none" || isSelf) && (
        <DetailPanel title="Emergency contact" className="md:col-span-2">
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <Row label="Name" value={emp.profile.emergencyContactName} />
            <Row label="Phone" value={emp.profile.emergencyContactPhone} />
            <Row label="Relationship" value={emp.profile.emergencyContactRelationship} />
          </dl>
        </DetailPanel>
      )}
    </div>
  )
}

export function EmploymentPanel({
  emp, isAdmin, canEditEmployment, onEditEmployment,
}: {
  emp: EmployeeDetail
  isAdmin: boolean
  canEditEmployment: boolean
  onEditEmployment: () => void
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <DetailPanel title="Role">
        <dl className="space-y-2 text-sm">
          <Row label="Job title" value={emp.profile.jobTitle} />
          <Row label="Department" value={emp.profile.department} />
          <Row label="Office" value={emp.profile.officeLocation} />
          <Row label="Type" value={EMP_TYPE_LABELS[emp.profile.employmentType]} />
          <Row label="Working hours" value={emp.profile.workingHours} />
        </dl>
        {canEditEmployment && (
          <Button variant="ghost" size="sm" className="mt-3" onClick={onEditEmployment}>Edit employment</Button>
        )}
      </DetailPanel>
      <DetailPanel title="Dates">
        <dl className="space-y-2 text-sm">
          <Row label="Start date" value={emp.profile.startDate ? format(new Date(emp.profile.startDate), "d MMM yyyy") : null} />
          <Row label="Probation ends" value={emp.profile.probationEndDate ? format(new Date(emp.profile.probationEndDate), "d MMM yyyy") : null} />
          <Row label="End date" value={emp.profile.endDate ? format(new Date(emp.profile.endDate), "d MMM yyyy") : null} />
          {emp.yearsOfService != null && <Row label="Years of service" value={String(emp.yearsOfService)} />}
          {emp.profile.salary != null && isAdmin && (
            <Row label="Salary" value={`£${emp.profile.salary.toLocaleString()}`} />
          )}
        </dl>
      </DetailPanel>
    </div>
  )
}
