import { ORYX_OFFICE } from "../constants"
import type { SiteVisitCalculationInput, SiteVisitCalculationResult } from "../types"
import { calculateFromRoute, validateSiteHours } from "./calculator-math"
import { GeocodeError, resolveSiteCoordinates } from "./geocode-site"
import { getDrivingRouteToSite, RoutingError } from "./routing-service"

export { GeocodeError, RoutingError }

export async function calculateSiteVisitCost(
  input: SiteVisitCalculationInput,
): Promise<SiteVisitCalculationResult> {
  const siteAddress = input.siteAddress?.trim()
  if (!siteAddress) throw new GeocodeError("Enter a site address or postcode")

  const hoursError = validateSiteHours(input.siteHours)
  if (hoursError) throw new Error(hoursError)

  const { lat, lng, resolvedAddress } = await resolveSiteCoordinates(
    siteAddress,
    input.siteLat,
    input.siteLng,
  )

  const route = await getDrivingRouteToSite({ lat, lng })

  return calculateFromRoute(
    { ...input, siteAddress: resolvedAddress, siteLat: lat, siteLng: lng },
    route,
    ORYX_OFFICE.addressLine,
  )
}
