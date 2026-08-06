#!/usr/bin/env node
/**
 * Pre-release gate — runs required checks sequentially; exits non-zero on first failure.
 * Does not trigger GitHub Actions (local/CI operator command only).
 */
import { spawnSync } from "node:child_process"

const steps = [
  ["lint", "npm run lint"],
  ["typecheck", "npm run typecheck"],
  ["test:unit", "npm run test:unit"],
  ["test:backup-restore", "npm run test:backup-restore"],
  ["build", "npm run build"],
  ["test:e2e", "npm run test:e2e"],
  ["audit", "npm audit --audit-level=high"],
]

for (const [name, cmd] of steps) {
  console.log(`\n=== release:check — ${name} ===`)
  const result = spawnSync(cmd, {
    shell: true,
    stdio: "inherit",
    env: process.env,
  })
  if (result.status !== 0) {
    console.error(`\nrelease:check FAILED at step: ${name}`)
    process.exit(result.status ?? 1)
  }
}

console.log("\nrelease:check — all steps passed")
