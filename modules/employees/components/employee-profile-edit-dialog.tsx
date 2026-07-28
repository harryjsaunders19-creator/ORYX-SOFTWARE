"use client"
import { Button } from "@/shared/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from "@/shared/ui/dialog"
import { Field } from "./employee-profile-primitives"

export interface EmployeeProfileEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  saving: boolean
  form: Record<string, string>
  onFormChange: (key: string, value: string) => void
  onSave: () => void
  canEditEmployment: boolean
}

export function EmployeeProfileEditDialog({
  open, onOpenChange, saving, form, onFormChange, onSave, canEditEmployment,
}: EmployeeProfileEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Edit profile</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name" value={form.firstName} onChange={v => onFormChange("firstName", v)} />
            <Field label="Last name" value={form.lastName} onChange={v => onFormChange("lastName", v)} />
            <Field label="Preferred name" value={form.preferredName} onChange={v => onFormChange("preferredName", v)} className="sm:col-span-2" />
            <Field label="Phone" value={form.phone} onChange={v => onFormChange("phone", v)} />
            <Field label="Mobile" value={form.mobile} onChange={v => onFormChange("mobile", v)} />
            {canEditEmployment && (
              <>
                <Field label="Job title" value={form.jobTitle} onChange={v => onFormChange("jobTitle", v)} />
                <Field label="Department" value={form.department} onChange={v => onFormChange("department", v)} />
              </>
            )}
            <Field label="Address" value={form.address} onChange={v => onFormChange("address", v)} className="sm:col-span-2" />
            <Field label="City" value={form.city} onChange={v => onFormChange("city", v)} />
            <Field label="Postcode" value={form.postcode} onChange={v => onFormChange("postcode", v)} />
            <Field label="Emergency contact" value={form.emergencyContactName} onChange={v => onFormChange("emergencyContactName", v)} />
            <Field label="Emergency phone" value={form.emergencyContactPhone} onChange={v => onFormChange("emergencyContactPhone", v)} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
