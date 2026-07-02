import type { CreatePasswordVaultInput, UpdatePasswordVaultInput } from "../types"

type ParseResult<T> = { data: T } | { error: string }

function optString(v: unknown): string | null {
  if (v == null || v === "") return null
  return typeof v === "string" ? v.trim() || null : null
}

export function parseCreateBody(body: Record<string, unknown>): ParseResult<CreatePasswordVaultInput> {
  const serviceName = typeof body.serviceName === "string" ? body.serviceName.trim() : ""
  if (!serviceName) return { error: "Service name is required" }

  const password = typeof body.password === "string" ? body.password : ""
  if (!password) return { error: "Password is required" }

  return {
    data: {
      serviceName,
      loginUrl: optString(body.loginUrl),
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
  if (body.loginUrl !== undefined) data.loginUrl = optString(body.loginUrl)
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
