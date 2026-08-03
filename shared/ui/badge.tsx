import { cn } from "@/shared/utils"
import { Typography } from "@/shared/design/typography"

/** Payment status — colour only for paid success / sent attention. */
const PAYMENT_BADGE: Record<string, string> = {
  DRAFT: "bg-nested-surface text-t2 border border-bd",
  SENT:  "bg-rs-bg text-rs-tx border border-rs-bd",
  PAID:  "bg-ok-bg text-ok-tx border border-ok-bd",
}

const pill = cn(
  "inline-flex items-center rounded-md px-2 py-0.5 whitespace-nowrap",
  Typography.Badge,
)

export function PaymentBadge({ status }: { status: string }) {
  return (
    <span className={cn(pill, PAYMENT_BADGE[status] ?? PAYMENT_BADGE.DRAFT)}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}
