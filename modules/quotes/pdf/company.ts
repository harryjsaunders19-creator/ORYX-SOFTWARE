/** Letterhead and footer details for quote PDFs. */
export const QUOTE_COMPANY = {
  name: "ORYX Scaffold Design Ltd",
  addressLines: [
    "Little Woodlands, 61 Bath Road, Willsbridge",
    "Bristol, BS30 6ES",
  ],
  phone: "0117 3290050",
  email: "harry@oryxdesignltd.co.uk",
  website: "www.oryxdesignltd.co.uk",
  /** Omit from PDF when null. */
  companyRegistration: null as string | null,
} as const

export const DEFAULT_QUOTE_TERMS = [
  "Customer will be billed after indicating acceptance of this quote.",
  "Payment will be due 21 days after the receipt of invoice.",
  "Please confirm acceptance of this quote in written form through email.",
  "Any further works or revisions after the submittal of the first design will be charged at £95.00 + VAT per hour.",
] as const
