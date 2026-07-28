import type { UserRow } from "@/modules/users/types"

export type SearchEntityType =
  | "job"
  | "revision"
  | "client"
  | "quote"
  | "invoice"
  | "user"
  | "calendar"
  | "employee"

export interface SearchHit {
  id: string
  type: SearchEntityType
  title: string
  subtitle: string
  href: string
  meta?: string
  score: number
}

export interface SearchGroup {
  type: SearchEntityType
  label: string
  items: SearchHit[]
}

export interface GlobalSearchResult {
  query: string
  groups: SearchGroup[]
  total: number
  tookMs: number
}

export interface GlobalSearchOptions {
  query: string
  role: "ADMIN" | "ENGINEER"
  limit?: number
  /** Required for employee search (access-scoped directory). */
  viewer?: UserRow
}
