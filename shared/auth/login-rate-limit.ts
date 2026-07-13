/** @deprecated Prefer `@/shared/auth/rate-limit` — kept for existing imports. */
export {
  LOGIN_RATE_WINDOW_MS,
  LOGIN_RATE_MAX_ATTEMPTS,
  resetLoginRateLimitMemory,
  checkLoginRateLimit,
  remainingLoginAttempts,
} from "./rate-limit"
