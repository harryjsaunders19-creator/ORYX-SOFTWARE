/**
 * One-time first-admin provisioning for production bootstrap.
 * Invoked only via `npm run admin:provision` — never during normal startup.
 */
import { createId } from "@paralleldrive/cuid2"
import { hashPassword, validatePasswordStrength } from "@/shared/auth/password"
import { userService } from "@/modules/users"
import { identitySwitchLogService } from "@/lib/services/identity-switch-service"
import { isProductionRuntime } from "@/shared/auth/test-environment"

export type AdminProvisionInput = {
  email: string
  password: string
  name?: string
  /** Explicit recovery when an admin already exists — use with care. */
  forceRecovery?: boolean
}

export type AdminProvisionResult = {
  userId: string
  email: string
  name: string
  recovery: boolean
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateAdminProvisionInput(input: AdminProvisionInput): string | null {
  const email = input.email.trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) return "A valid email address is required"
  const pwErr = validatePasswordStrength(input.password)
  if (pwErr) return pwErr
  const name = (input.name ?? "").trim()
  if (name.length > 0 && name.length < 2) return "Name must be at least 2 characters when provided"
  return null
}

export async function provisionFirstAdmin(input: AdminProvisionInput): Promise<AdminProvisionResult> {
  const validationError = validateAdminProvisionInput(input)
  if (validationError) throw new Error(validationError)

  const email = input.email.trim().toLowerCase()
  const name = (input.name ?? email.split("@")[0] ?? "Administrator").trim()
  const recovery = input.forceRecovery === true

  const existingAdmins = await userService.activeAdminCount()
  if (existingAdmins > 0 && !recovery) {
    throw new Error(
      "An active administrator already exists. Refusing to provision. "
      + "Set ADMIN_PROVISION_FORCE_RECOVERY=true only for an explicit recovery.",
    )
  }

  const existingByEmail = await userService.findByEmail(email)
  const passwordHash = hashPassword(input.password)
  const id = existingByEmail?.id ?? createId()

  if (existingByEmail) {
    await userService.update(existingByEmail.id, {
      name,
      email,
      role: "ADMIN",
      active: 1,
      passwordHash,
      mustChangePassword: 0,
    })
  } else {
    await userService.create({
      id,
      name,
      email,
      role: "ADMIN",
      passwordHash,
      mustChangePassword: 0,
    })
  }

  await identitySwitchLogService.log({
    action: "FIRST_ADMIN_PROVISIONED",
    realUserId: id,
    realUserName: name,
    detail: JSON.stringify({
      email,
      recovery,
      productionRuntime: isProductionRuntime(),
      at: new Date().toISOString(),
    }),
  })

  return { userId: id, email, name, recovery }
}
