import Image from "next/image"
import { cn } from "@/lib/utils"

const LOGO_SRC = "/branding/LOGO3.png"

type OryxLogoProps = {
  variant?: "sidebar" | "auth" | "auth-panel" | "login"
  className?: string
  priority?: boolean
}

const VARIANTS = {
  sidebar: {
    width: 220,
    height: 80,
    className: "w-full max-w-[200px] h-auto",
  },
  auth: {
    width: 160,
    height: 58,
    className: "w-[120px] h-auto sm:w-[140px]",
  },
  "auth-panel": {
    width: 280,
    height: 100,
    className: "w-full max-w-[260px] h-auto",
  },
  login: {
    width: 180,
    height: 66,
    className: "w-[140px] h-auto",
  },
} as const

export function OryxLogo({ variant = "sidebar", className, priority }: OryxLogoProps) {
  const s = VARIANTS[variant]
  return (
    <Image
      src={LOGO_SRC}
      alt="Oryx Scaffold Design"
      width={s.width}
      height={s.height}
      className={cn("shrink-0 object-contain", s.className, className)}
      priority={priority ?? variant === "sidebar"}
    />
  )
}
