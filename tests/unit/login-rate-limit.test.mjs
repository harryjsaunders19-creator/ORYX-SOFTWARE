import { describe, it, beforeEach } from "node:test"
import assert from "node:assert/strict"
import {
  checkLoginRateLimit,
  remainingLoginAttempts,
  resetLoginRateLimitMemory,
  LOGIN_RATE_MAX_ATTEMPTS,
} from "../../shared/auth/login-rate-limit.ts"

describe("login rate limit (memory)", () => {
  beforeEach(() => {
    resetLoginRateLimitMemory()
  })

  it("allows the first attempt", async () => {
    assert.equal(await checkLoginRateLimit("test:user@example.com"), true)
  })

  it("blocks after MAX attempts in the window", async () => {
    const key = "test:blocked@example.com"
    for (let i = 0; i < LOGIN_RATE_MAX_ATTEMPTS; i++) {
      assert.equal(await checkLoginRateLimit(key), true)
    }
    assert.equal(await checkLoginRateLimit(key), false)
    assert.equal(await remainingLoginAttempts(key), 0)
  })

  it("tracks remaining attempts", async () => {
    const key = "test:remaining@example.com"
    assert.equal(await remainingLoginAttempts(key), LOGIN_RATE_MAX_ATTEMPTS)
    await checkLoginRateLimit(key)
    assert.equal(await remainingLoginAttempts(key), LOGIN_RATE_MAX_ATTEMPTS - 1)
  })
})
