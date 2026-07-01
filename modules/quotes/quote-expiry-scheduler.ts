/**
 * Hourly check — expires SENT quotes whose validity date has passed.
 */
import { quoteService } from "./services/quote-service"

const CHECK_INTERVAL_MS = 60 * 60 * 1000

let started = false

async function runExpiryPass() {
  try {
    const expired = await quoteService.expirePastDue()
    if (expired.length > 0) {
      console.log(`[quote-expiry-scheduler] Marked ${expired.length} quote(s) as EXPIRED`)
    }
  } catch (err) {
    console.error("[quote-expiry-scheduler] Error during expiry pass:", err)
  }
}

export function startQuoteExpiryScheduler() {
  if (started) return
  started = true
  console.log("[quote-expiry-scheduler] Quote expiry scheduler started (hourly check)")
  void runExpiryPass()
  setInterval(() => { void runExpiryPass() }, CHECK_INTERVAL_MS)
}
