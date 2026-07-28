import type { Client } from "@/lib/types"

export const CLIENT_LIMIT = 50

export type ClientWithMeta = Client & { activeJobCount: number; onHold: boolean }
export type ClientsData = { clients: ClientWithMeta[]; total: number; page?: number; limit?: number }
