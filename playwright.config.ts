import { defineConfig, devices } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

/** Load `.env.e2e` written by `npm run e2e:supabase:up` when present. */
function loadEnvE2e(): void {
  const envPath = path.join(process.cwd(), ".env.e2e")
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const i = trimmed.indexOf("=")
    if (i < 0) continue
    const key = trimmed.slice(0, i)
    const value = trimmed.slice(i + 1)
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnvE2e()

const supabaseE2e = Boolean(
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
  (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()),
)

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      E2E: "true",
      ALLOW_BOOTSTRAP_TEST_ACCOUNTS: "true",
      ...(supabaseE2e
        ? {
            FORCE_SUPABASE_ONLY: "true",
            AUTH_SECRET: process.env.AUTH_SECRET || "e2e-auth-secret-not-for-production",
          }
        : {}),
    },
  },
})
