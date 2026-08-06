#!/usr/bin/env node
/**
 * One-time first-admin provisioning — never runs during normal app startup.
 *
 * Usage:
 *   ADMIN_PROVISION_EMAIL=you@company.com ADMIN_PROVISION_PASSWORD='SecurePass1' npm run admin:provision
 *
 * Optional:
 *   ADMIN_PROVISION_NAME="Jane Admin"
 *   ADMIN_PROVISION_FORCE_RECOVERY=true   # when an admin already exists (recovery only)
 *
 * After provisioning, remove ADMIN_PROVISION_PASSWORD from shell history / CI secrets.
 */
import { provisionFirstAdmin } from "../shared/auth/admin-provision.ts"

function readPassword() {
  const fromEnv = process.env.ADMIN_PROVISION_PASSWORD?.trim()
  if (fromEnv) return fromEnv
  throw new Error(
    "ADMIN_PROVISION_PASSWORD is required (env var). Do not pass passwords on the command line.",
  )
}

async function main() {
  const email = process.env.ADMIN_PROVISION_EMAIL?.trim()
  if (!email) {
    console.error("ADMIN_PROVISION_EMAIL is required.")
    process.exit(1)
  }

  const name = process.env.ADMIN_PROVISION_NAME?.trim()
  const forceRecovery = process.env.ADMIN_PROVISION_FORCE_RECOVERY === "true"

  let password
  try {
    password = readPassword()
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }

  try {
    const result = await provisionFirstAdmin({
      email,
      password,
      name,
      forceRecovery,
    })
    console.log(JSON.stringify({
      event: "first_admin_provisioned",
      userId: result.userId,
      email: result.email,
      name: result.name,
      recovery: result.recovery,
      at: new Date().toISOString(),
    }))
    console.log("\nFirst administrator provisioned successfully.")
    console.log("Remove ADMIN_PROVISION_PASSWORD from your environment and rotate any shared secret stores.")
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

main()
