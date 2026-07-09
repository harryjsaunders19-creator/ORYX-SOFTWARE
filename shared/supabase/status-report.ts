import { createAdminClient } from "./admin"
import {
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  isSupabaseAdminConfigured,
  isSupabaseConfigured,
} from "./config"
import { supabaseModuleFlags } from "./feature-flags"
import {
  SUPABASE_GO_LIVE_STEPS,
  SUPABASE_INFRA_MIGRATIONS,
  SUPABASE_MIGRATION_MODULES,
  type SupabaseModuleSpec,
} from "./migration-catalog"

export type TableProbe = {
  name: string
  ready: boolean
  count: number | null
  error?: string
}

export type ModuleStatusReport = {
  id: string
  label: string
  enabled: boolean
  envVar: string
  migration: string
  syncScript: string
  verifyScript?: string
  ready: boolean
  tables: TableProbe[]
  dependsOn?: string[]
}

export type SupabaseStatusReport = {
  configured: boolean
  connected: boolean
  anonHealthOk: boolean
  serviceRoleOk: boolean
  adminConfigured: boolean
  serviceRoleSet: boolean
  onVercel: boolean
  url?: string
  modules: ModuleStatusReport[]
  infrastructure: Array<{
    id: string
    label: string
    migration: string
    ready: boolean
    tables: TableProbe[]
  }>
  flags: ReturnType<typeof supabaseModuleFlags>
  issues: string[]
  goLiveSteps: readonly string[]
  sqliteStillActive: boolean
  summary: {
    modulesReady: number
    modulesTotal: number
    tablesReady: number
    tablesTotal: number
    healthy: boolean
  }
  message: string
}

async function probeSupabaseConnectivity(): Promise<{
  connected: boolean
  anonOk: boolean
  serviceOk: boolean
  anonDetail?: string
}> {
  const url = getSupabaseUrl()?.replace(/\/$/, "")
  const anonKey = getSupabaseAnonKey()
  if (!url || !anonKey) {
    return { connected: false, anonOk: false, serviceOk: false }
  }

  let anonOk = false
  let anonDetail: string | undefined
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      signal: AbortSignal.timeout(12_000),
    })
    anonOk = res.ok
    if (!anonOk) {
      anonDetail = `HTTP ${res.status}`
      const body = await res.text().catch(() => "")
      if (body.trim()) anonDetail += ` — ${body.trim().slice(0, 100)}`
    }
  } catch (err) {
    anonDetail = err instanceof Error ? err.message : String(err)
  }

  let serviceOk = false
  if (isSupabaseAdminConfigured()) {
    try {
      const { error } = await createAdminClient()
        .from("jobs")
        .select("id", { count: "exact", head: true })
      serviceOk = !error
    } catch {
      serviceOk = false
    }
  }

  return {
    connected: anonOk || serviceOk,
    anonOk,
    serviceOk,
    anonDetail,
  }
}

async function probeTable(table: string): Promise<TableProbe> {
  try {
    const { count, error } = await createAdminClient()
      .from(table)
      .select("*", { count: "exact", head: true })
    if (error) return { name: table, ready: false, count: null, error: error.message }
    return { name: table, ready: true, count: count ?? 0 }
  } catch (err) {
    return {
      name: table,
      ready: false,
      count: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function moduleReport(
  spec: SupabaseModuleSpec,
  flags: ReturnType<typeof supabaseModuleFlags>,
  adminConfigured: boolean,
): Promise<ModuleStatusReport> {
  const enabled = flags[spec.flagKey]
  let tables: TableProbe[] = spec.tables.map(name => ({
    name,
    ready: false,
    count: null,
    error: adminConfigured ? undefined : "Service role not configured",
  }))

  if (adminConfigured) {
    tables = await Promise.all(spec.tables.map(probeTable))
  }

  const ready = tables.every(t => t.ready)

  return {
    id: spec.id,
    label: spec.label,
    enabled,
    envVar: spec.envVar,
    migration: spec.migration,
    syncScript: spec.syncScript,
    verifyScript: spec.verifyScript,
    ready,
    tables,
    dependsOn: spec.dependsOn,
  }
}

function collectIssues(
  modules: ModuleStatusReport[],
  infrastructure: SupabaseStatusReport["infrastructure"],
  adminConfigured: boolean,
): string[] {
  const issues: string[] = []

  if (!getSupabaseUrl()) issues.push("Missing NEXT_PUBLIC_SUPABASE_URL")
  if (!getSupabaseAnonKey()) issues.push("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY")
  if (!getSupabaseServiceRoleKey()) {
    issues.push(
      "Missing SUPABASE_SERVICE_ROLE_KEY — API routes cannot read/write Supabase without it.",
    )
  }

  for (const mod of modules) {
    if (!mod.ready) {
      for (const t of mod.tables) {
        if (!t.ready) {
          issues.push(
            `${mod.label}: table "${t.name}" — ${t.error ?? "not found"} (run ${mod.migration})`,
          )
        }
      }
    } else if (mod.enabled && mod.id === "jobs" && (mod.tables[0]?.count ?? 0) === 0) {
      issues.push(
        "Jobs table is empty in Supabase — run npm run supabase:sync-jobs from a machine with your SQLite data.",
      )
    }
  }

  const archiveInfra = infrastructure.find(i => i.id === "soft-delete")
  const archiveTable = archiveInfra?.tables.find(t => t.name === "archive_log")
  if (adminConfigured && archiveTable && !archiveTable.ready) {
    issues.push("Missing archive_log — run supabase/migrations/011_soft_delete.sql (breaks archived items).")
  }

  return issues
}

export async function buildSupabaseStatusReport(): Promise<SupabaseStatusReport> {
  const configured = isSupabaseConfigured()
  const adminConfigured = isSupabaseAdminConfigured()
  const serviceRoleSet = !!getSupabaseServiceRoleKey()
  const flags = supabaseModuleFlags()
  const issues: string[] = []

  if (!configured) {
    return {
      configured: false,
      connected: false,
      anonHealthOk: false,
      serviceRoleOk: false,
      adminConfigured,
      serviceRoleSet,
      onVercel: !!process.env.VERCEL,
      modules: [],
      infrastructure: [],
      flags,
      issues: ["Supabase public env vars are not fully set."],
      goLiveSteps: SUPABASE_GO_LIVE_STEPS,
      sqliteStillActive: true,
      summary: { modulesReady: 0, modulesTotal: SUPABASE_MIGRATION_MODULES.length, tablesReady: 0, tablesTotal: 0, healthy: false },
      message: "Supabase is not configured.",
    }
  }

  const connectivity = await probeSupabaseConnectivity()
  const connected = connectivity.connected
  const anonHealthOk = connectivity.anonOk
  const serviceRoleOk = connectivity.serviceOk

  if (!connected) {
    if (!connectivity.anonOk) {
      issues.push(
        connectivity.anonDetail
          ? `Supabase unreachable or anon key rejected (${connectivity.anonDetail}).`
          : "Supabase health check failed — verify NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      )
    }
    if (!serviceRoleOk && adminConfigured) {
      issues.push(
        "Service role probe failed — verify SUPABASE_SERVICE_ROLE_KEY matches Supabase → Project Settings → API.",
      )
    }
  } else if (!anonHealthOk && serviceRoleOk) {
    issues.push(
      `Anon key failed auth health check${connectivity.anonDetail ? ` (${connectivity.anonDetail})` : ""} — copy the anon / publishable key from Supabase → Project Settings → API into Vercel as NEXT_PUBLIC_SUPABASE_ANON_KEY, then redeploy. Server reads/writes work via service role.`,
    )
  }

  const modules = adminConfigured && connected
    ? await Promise.all(SUPABASE_MIGRATION_MODULES.map(m => moduleReport(m, flags, adminConfigured)))
    : SUPABASE_MIGRATION_MODULES.map(spec => ({
        id: spec.id,
        label: spec.label,
        enabled: flags[spec.flagKey],
        envVar: spec.envVar,
        migration: spec.migration,
        syncScript: spec.syncScript,
        verifyScript: spec.verifyScript,
        ready: false,
        tables: spec.tables.map(name => ({
          name,
          ready: false,
          count: null,
          error: "Not probed — configure service role and connect",
        })),
        dependsOn: spec.dependsOn,
      }))

  const infrastructure = adminConfigured && connected
    ? await Promise.all(
        SUPABASE_INFRA_MIGRATIONS.map(async infra => ({
          id: infra.id,
          label: infra.label,
          migration: infra.migration,
          ready: infra.tables.length === 0
            ? true
            : (await Promise.all(infra.tables.map(probeTable))).every(t => t.ready),
          tables: infra.tables.length
            ? await Promise.all(infra.tables.map(probeTable))
            : [],
        })),
      )
    : SUPABASE_INFRA_MIGRATIONS.map(infra => ({
        id: infra.id,
        label: infra.label,
        migration: infra.migration,
        ready: false,
        tables: [],
      }))

  // archived_at column check
  if (adminConfigured && connected) {
    try {
      const { error } = await createAdminClient().from("jobs").select("archived_at").limit(1)
      if (error && /archived_at/i.test(error.message)) {
        issues.push("Missing archived_at on jobs — run 011_soft_delete.sql (breaks dashboard).")
      }
    } catch { /* ignore */ }
  }

  issues.push(...collectIssues(modules, infrastructure, adminConfigured))

  const tablesTotal = modules.reduce((n, m) => n + m.tables.length, 0)
  const tablesReady = modules.reduce(
    (n, m) => n + m.tables.filter(t => t.ready).length,
    0,
  )
  const modulesReady = modules.filter(m => m.ready).length
  const blockingIssues = issues.filter(i => !i.startsWith("Anon key failed"))
  const healthy = connected && adminConfigured && modules.every(m => m.ready) && blockingIssues.length === 0

  const maskedUrl = getSupabaseUrl()!.replace(/^(https:\/\/[^.]+).*/, "$1.***.supabase.co")

  return {
    configured: true,
    connected,
    anonHealthOk,
    serviceRoleOk,
    adminConfigured,
    serviceRoleSet,
    onVercel: !!process.env.VERCEL,
    url: maskedUrl,
    modules,
    infrastructure,
    flags,
    issues: [...new Set(issues)],
    goLiveSteps: SUPABASE_GO_LIVE_STEPS,
    sqliteStillActive: !adminConfigured || !flags.jobs,
    summary: {
      modulesReady,
      modulesTotal: modules.length,
      tablesReady,
      tablesTotal,
      healthy,
    },
    message: issues.length
      ? issues[0]
      : connected
        ? anonHealthOk
          ? `Supabase connected — ${modulesReady}/${modules.length} modules ready.`
          : `Supabase connected via service role — ${modulesReady}/${modules.length} modules ready. Update anon key in Vercel when convenient.`
        : "Env vars set but Supabase is not reachable.",
  }
}
