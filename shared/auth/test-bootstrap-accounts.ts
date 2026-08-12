/**
 * Test-only bootstrap account definitions.
 * NEVER import this from production request paths without
 * assertTestEnvironment() / isTestUserProvisioningAllowed() first.
 *
 * Passwords are stored only as bcrypt hashes — never log them.
 */
export const TEST_BOOTSTRAP_ACCOUNT_EMAILS = [
  "admin@test.com",
  "engineer@test.com",
  "accounts@test.com",
] as const

export type TestBootstrapAccount = {
  id: string
  email: (typeof TEST_BOOTSTRAP_ACCOUNT_EMAILS)[number]
  name: string
  role: "ADMIN" | "ENGINEER" | "ACCOUNTS"
  /** bcrypt cost=12 hash — do not log */
  passwordHash: string
}

export const TEST_BOOTSTRAP_ACCOUNTS: readonly TestBootstrapAccount[] = [
  {
    id: "bootstrap-admin-00000001",
    email: "admin@test.com",
    name: "Admin",
    role: "ADMIN",
    // Known E2E password only — see tests/e2e/helpers.ts
    passwordHash: "$2b$12$92nRgb8jPt20D4.fPVhIOudgpnPaAozVDOxbw32dArHspiSFy2OGS",
  },
  {
    id: "bootstrap-engineer-00000001",
    email: "engineer@test.com",
    name: "Engineer",
    role: "ENGINEER",
    // Known E2E password only — see tests/e2e/helpers.ts
    passwordHash: "$2b$12$NWRIw4dbY47HJRDhOZStaOuY7s4Js.emZPm9QMHJysvYgj1gOrB7u",
  },
  {
    id: "bootstrap-accounts-00000001",
    email: "accounts@test.com",
    name: "Accounts",
    role: "ACCOUNTS",
    // Known E2E password only — see tests/e2e/helpers.ts / e2e-seed-supabase-users.mjs
    passwordHash: "$2b$12$y4FKWqQ3EowvFLvSe99i5escOcfGfO/8b7aLmEq5g9s/gePyWMTMy",
  },
]
