"use client"

/**
 * Browser subscription to Jobs Register Broadcast + cleanup on unmount.
 */
import { useEffect, useRef } from "react"
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js"
import {
  JOBS_REGISTER_LIVE_EVENT,
  JOBS_REGISTER_LIVE_TOPIC,
  type JobsRegisterLivePayload,
} from "./jobs-register-live"

let browserClient: SupabaseClient | null = null

/** Active Jobs Register Broadcast channels (test / diagnostics). */
let activeJobsRegisterLiveChannels = 0

export function getActiveJobsRegisterLiveChannelCount(): number {
  return activeJobsRegisterLiveChannels
}

function getBrowserRealtimeClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!supabaseUrl || !anon) return null
  if (!browserClient) {
    browserClient = createClient(supabaseUrl, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 4 } },
    })
  }
  return browserClient
}

/**
 * Subscribe once per mount. Calls `onRemoteChange` for Broadcast events.
 * Cleans up the channel on unmount / disabled — prevents duplicate listeners.
 */
export function useJobsRegisterLive(opts: {
  enabled: boolean
  onRemoteChange: (payload: JobsRegisterLivePayload) => void
}): void {
  const { enabled, onRemoteChange } = opts
  const handlerRef = useRef(onRemoteChange)

  useEffect(() => {
    handlerRef.current = onRemoteChange
  }, [onRemoteChange])

  useEffect(() => {
    if (!enabled) return
    const client = getBrowserRealtimeClient()
    if (!client) return

    let channel: RealtimeChannel | null = null
    let cancelled = false

    channel = client
      .channel(JOBS_REGISTER_LIVE_TOPIC, {
        config: { broadcast: { self: false } },
      })
      .on("broadcast", { event: JOBS_REGISTER_LIVE_EVENT }, ({ payload }) => {
        if (cancelled) return
        const body = (payload ?? {}) as Partial<JobsRegisterLivePayload>
        handlerRef.current({
          reason: body.reason ?? "unknown",
          jobId: body.jobId ?? null,
          at: typeof body.at === "number" ? body.at : Date.now(),
        })
      })
      .subscribe()

    activeJobsRegisterLiveChannels += 1
    if (typeof window !== "undefined") {
      ;(window as unknown as { __oryxJobsLiveChannels?: number }).__oryxJobsLiveChannels =
        activeJobsRegisterLiveChannels
    }

    return () => {
      cancelled = true
      activeJobsRegisterLiveChannels = Math.max(0, activeJobsRegisterLiveChannels - 1)
      if (typeof window !== "undefined") {
        ;(window as unknown as { __oryxJobsLiveChannels?: number }).__oryxJobsLiveChannels =
          activeJobsRegisterLiveChannels
      }
      if (channel) void client.removeChannel(channel)
    }
  }, [enabled])
}
