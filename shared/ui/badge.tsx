import { cn } from "@/shared/utils"

const PAYMENT_BADGE: Record<string, string> = {
  DRAFT: "bg-t1/[0.06] text-t2",
  SENT:  "bg-ac-bg text-ac",
  PAID:  "bg-ok-bg text-ok-tx",
}

const pill = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap"

export function PaymentBadge({ status }: { status: string }) {
  return (
    <span className={cn(pill, PAYMENT_BADGE[status] ?? PAYMENT_BADGE.DRAFT)}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}
