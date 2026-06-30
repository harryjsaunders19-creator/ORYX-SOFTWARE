import Image from "next/image"
import { cn } from "@/lib/utils"
import { BRAND_LOGO_DOCUMENT, BRAND_LOGO_MENU } from "@/lib/branding"

type OryxLogoProps = {
  /** `menu` — sidebar nav (greyscale logo). `login` / `auth*` / `document` — LOGO2025. */
  variant?: "menu" | "sidebar" | "login" | "auth" | "auth-panel" | "document"
  className?: string
  priority?: boolean
}

const VARIANTS = {
  menu: {
    src: BRAND_LOGO_MENU,
    width: 200,
    height: 72,
    className: "w-full max-w-[180px] h-auto",
    alt: "Oryx Design",
  },
  sidebar: {
    src: BRAND_LOGO_MENU,
    width: 200,
    height: 72,
    className: "w-full max-w-[180px] h-auto",
    alt: "Oryx Design",
  },
  auth: {
    src: BRAND_LOGO_DOCUMENT,
    width: 160,
    height: 58,
    className: "w-[120px] h-auto sm:w-[140px]",
    alt: "Oryx Scaffold Design",
  },
  "auth-panel": {
    src: BRAND_LOGO_DOCUMENT,
    width: 280,
    height: 100,
    className: "w-full max-w-[260px] h-auto",
    alt: "Oryx Scaffold Design",
  },
  login: {
    src: BRAND_LOGO_DOCUMENT,
    width: 320,
    height: 120,
    className: "w-[180px] h-auto sm:w-[240px]",
    alt: "Oryx Scaffold Design",
  },
  document: {
    src: BRAND_LOGO_DOCUMENT,
    width: 280,
    height: 100,
    className: "h-auto w-auto",
    alt: "Oryx Scaffold Design",
  },
} as const

export function OryxLogo({ variant = "menu", className, priority }: OryxLogoProps) {
  const s = VARIANTS[variant === "sidebar" ? "menu" : variant]
  return (
    <Image
      src={s.src}
      alt={s.alt}
      width={s.width}
      height={s.height}
      className={cn("shrink-0 object-contain", s.className, className)}
      priority={priority ?? (variant === "menu" || variant === "sidebar")}
    />
  )
}
