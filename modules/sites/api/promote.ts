/**
 * Promote one-off job location(s) into a Managed Site and link jobs.
 * Preserves all job data (revisions, quotes, CATII, drawing numbers).
 */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireModuleAccess, actorName } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { siteService, formatSiteAddress, parseLegacySiteAddress } from "@/modules/sites"
import { isMissingSitesSchemaError, SITES_MIGRATION_HINT } from "@/modules/sites/lib/schema-errors"
import { clientService } from "@/modules/clients"
import { jobService } from "@/modules/jobs/services/job-service"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"
import { createAdminClient } from "@/shared/supabase/admin"
import { nowIso } from "@/lib/db/helpers"

const bodySchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1),
  address: z.string().optional(),
  postcode: z.string().nullable().optional(),
  jobIds: z.array(z.string()).default([]),
  notes: z.string().nullable().optional(),
})

/** POST /api/sites/promote — convert one-off location into Managed Site */
export async function POST(req: NextRequest) {
  const auth = await requireModuleAccess("jobs")
  if (auth instanceof NextResponse) return auth

  try {
    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 422 })
    }
    const body = parsed.data
    const client = await clientService.findUnique(body.clientId)
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 })

    const parsedAddr = parseLegacySiteAddress(body.address ?? "")
    const site = await siteService.create(
      {
        clientId: body.clientId,
        name: body.name.trim(),
        addressLine1: parsedAddr.addressLine1,
        city: parsedAddr.city,
        postcode: body.postcode?.trim() || parsedAddr.postcode,
        country: "United Kingdom",
        notes: body.notes?.trim() || null,
      },
      { id: auth.user.id, name: actorName(auth.user) },
    )

    const displayAddress = formatSiteAddress(site) || site.name
    const linked: string[] = []
    const actor = { id: auth.user.id, name: actorName(auth.user) }

    for (const jobId of body.jobIds) {
      const job = await jobService.findUnique(jobId)
      if (!job) continue
      if (job.clientId && job.clientId !== body.clientId) continue

      await jobService.update(jobId, {
        siteId: site.id,
        locationMode: "MANAGED_SITE",
        locationName: site.name,
        siteName: site.name,
        siteAddress: displayAddress,
        address: displayAddress,
        postcode: site.postcode,
        changedBy: actor.name,
      })

      if (isSupabaseOnly()) {
        await createAdminClient().from("parent_jobs").update({
          site_id: site.id,
          location_mode: "MANAGED_SITE",
          location_name: site.name,
          site_name: site.name,
          site_address: displayAddress,
          address: displayAddress,
          postcode: site.postcode,
          updated_at: nowIso(),
        }).eq("id", jobId)
      }

      try {
        await siteService.logJobLinked({
          siteId: site.id,
          jobId,
          drawingNumber: job.drawingNumber,
          performedBy: actor.id,
          performedByName: actor.name,
        })
      } catch {
        /* audit soft-fail */
      }
      linked.push(jobId)
    }

    const summary = await siteService.getSummary(site.id).catch(() => null)
    return NextResponse.json({
      site: summary ?? site,
      linkedJobIds: linked,
    }, { status: 201 })
  } catch (err) {
    if (isMissingSitesSchemaError(err)) {
      return NextResponse.json({ error: SITES_MIGRATION_HINT, code: "SITES_SCHEMA_MISSING" }, { status: 503 })
    }
    return apiInternalError("sites.promote", err, undefined, { exposeDetail: true })
  }
}
