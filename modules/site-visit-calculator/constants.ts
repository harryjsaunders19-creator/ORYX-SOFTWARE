/** ORYX office — all site visits start and end here (round trip). */
export const ORYX_OFFICE = {
  name: "ORYX Scaffold Design Ltd",
  addressLine: "Little Woodlands, 61 Bath Road, Willsbridge, Bristol, BS30 6ES",
  /** Geocoded via postcodes.io (BS30 6ES) */
  lat: 51.4329,
  lng: -2.4564,
} as const

/** HMRC approved mileage rate (pounds per mile). */
export const DEFAULT_MILEAGE_RATE = 0.45

/** Engineer hourly charge (pounds per hour). */
export const DEFAULT_HOURLY_RATE = 95

/** Labour fees round up to this interval (ex VAT). */
export const BILLING_INTERVAL = DEFAULT_HOURLY_RATE

/** Flat day rate when one-way drive exceeds the threshold (ex VAT). */
export const DAY_RATE = 950

/** One-way drive beyond this duration triggers the day rate. */
export const DAY_RATE_DRIVE_THRESHOLD_HOURS = 3.5

/** Standard UK VAT rate. */
export const DEFAULT_VAT_RATE = 0.2

/** Preset site durations — half-hour steps from 0.5 to 4 hours. */
export const SITE_HOUR_PRESETS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4] as const

export const DEFAULT_SITE_HOURS = 1

export const MIN_SITE_HOURS = 0.5
export const MAX_SITE_HOURS = 24

/** Minimum on-site time charged (even if a shorter duration is selected). */
export const MIN_BILLABLE_SITE_HOURS = 1
