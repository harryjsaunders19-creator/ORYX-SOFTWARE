/**
 * Server-side Jobs Register live notify (Broadcast over Supabase Realtime HTTP).
 * Fire-and-forget — never blocks or fails the mutation response.
 */
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from "@/shared/supabase/config"
import { logEvent } from "@/shared/logger"
import {
  JOBS_REGISTER_LIVE_EVENT,
  JOBS_REGISTER_LIVE_TOPIC,
  type JobsRegisterLivePayload,
  type JobsRegisterLiveReason,
} from "./jobs-register-live"

export function notifyJobsRegisterChanged(opts: {
  reason: JobsRegisterLiveReason
  jobId?: string | null
}): void {
  const url = getSupabaseUrl()
  const key = getSupabaseServiceRoleKey()
  // Need anon configured too so clients can subscribe; otherwise skip publish.
  if (!url || !key || !getSupabaseAnonKey()) return

  const payload: JobsRegisterLivePayload = {
    reason: opts.reason,
    jobId: opts.jobId ?? null,
    at: Date.now(),
  }

  const endpoint = `${url.replace(/\/$/, "")}/realtime/v1/api/broadcast`
  void fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          topic: JOBS_REGISTER_LIVE_TOPIC,
          event: JOBS_REGISTER_LIVE_EVENT,
          payload,
          private: false,
        },
      ],
    }),
  }).catch(err => {
    logEvent(
      "jobs.live.broadcast_failed",
      { error: err instanceof Error ? err.message : String(err) },
      "warn",
    )
  })
}
