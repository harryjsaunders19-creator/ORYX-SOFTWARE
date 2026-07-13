import type { CreatePasswordVaultInput, UpdatePasswordVaultInput } from "../types"

type ParseResult<T> = { data: T } | { error: string }

function optString(v: unknown): string | null {
  if (v == null || v === "") return null
  return typeof v === "string" ? v.trim() || null : null
}

/** Allow only http(s) URLs — blocks javascript:/data:/etc stored XSS via href. */
export function normalizeLoginUrl(raw: string | null | undefined): ParseResult<string | null> {
  if (raw == null || raw === "") return { data: null }
  const trimmed = typeof raw === "string" ? raw.trim() : ""
  if (!trimmed) return { data: null }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { error: "Login URL must be a valid http(s) address" }
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Login URL must start with http:// or https://" }
  }
  return { data: parsed.toString() }
}

/** Safe href for rendering vault login links (null if unsafe). */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  const result = normalizeLoginUrl(raw)
  return "data" in result ? result.data : null
}

export function parseCreateBody(body: Record<string, unknown>): ParseResult<CreatePasswordVaultInput> {
  const serviceName = typeof body.serviceName === "string" ? body.serviceName.trim() : ""
  if (!serviceName) return { error: "Service name is required" }

  const password = typeof body.password === "string" ? body.password : ""
  if (!password) return { error: "Password is required" }

  const loginUrl = normalizeLoginUrl(optString(body.loginUrl))
  if ("error" in loginUrl) return loginUrl

  return {
    data: {
      serviceName,
      loginUrl: loginUrl.data,
      username: optString(body.username),
      password,
      category: optString(body.category),
      notes: optString(body.notes),
    },
  }
}

export function parseUpdateBody(body: Record<string, unknown>): ParseResult<UpdatePasswordVaultInput> {
  const data: UpdatePasswordVaultInput = {}

  if (body.serviceName !== undefined) {
    const serviceName = typeof body.serviceName === "string" ? body.serviceName.trim() : ""
    if (!serviceName) return { error: "Service name is required" }
    data.serviceName = serviceName
  }
  if (body.loginUrl !== undefined) {
    const loginUrl = normalizeLoginUrl(optString(body.loginUrl))
    if ("error" in loginUrl) return loginUrl
    data.loginUrl = loginUrl.data
  }
  if (body.username !== undefined) data.username = optString(body.username)
  if (body.password !== undefined) {
    if (typeof body.password !== "string" || !body.password) {
      return { error: "Password cannot be empty" }
    }
    data.password = body.password
  }
  if (body.category !== undefined) data.category = optString(body.category)
  if (body.notes !== undefined) data.notes = optString(body.notes)

  if (!Object.keys(data).length) return { error: "No fields to update" }
  return { data }
}

export function parseSortOrder(raw: string | null): "asc" | "desc" {
  return raw === "desc" ? "desc" : "asc"
}
