import { geocodeAddress } from "@/modules/job-map/services/geocode-service"

export class GeocodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GeocodeError"
  }
}

export async function resolveSiteCoordinates(
  address: string,
  lat?: number | null,
  lng?: number | null,
): Promise<{ lat: number; lng: number; resolvedAddress: string }> {
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng, resolvedAddress: address.trim() }
  }

  const trimmed = address.trim()
  if (!trimmed) throw new GeocodeError("Enter a site address or postcode")

  const result = await geocodeAddress(trimmed)
  if (!result) {
    throw new GeocodeError(
      "We couldn't find that address — try a full address or valid UK postcode",
    )
  }

  return {
    lat: result.lat,
    lng: result.lng,
    resolvedAddress: trimmed,
  }
}
