import Image from "next/image"
import { cn } from "@/shared/utils"
import { BRAND_LOGO_DOCUMENT, BRAND_LOGO_MENU } from "@/shared/branding/branding"

type OryxLogoProps = {
  /** `menu` — sidebar nav (greyscale logo). `login` / `auth*` / `document` — LOGO2025. */
  variant?: "menu" | "sidebar" | "login" | "auth" | "auth-panel" | "document"
  className?: string
  priority?: boolean
}

const VARIANTS = {
  menu: {
    src: BRAND_LOGO_MENU,
    width: 1024,
    height: 631,
    className: "w-full max-w-[180px] h-auto",
    alt: "Oryx Scaffold Design",
  },
  sidebar: {
    src: BRAND_LOGO_MENU,
    width: 1024,
    height: 631,
    className: "w-full max-w-[180px] h-auto",
    alt: "Oryx Scaffold Design",
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

  // Sidebar mark: luminance mask on a white fill — black in the PNG becomes
  // transparent so only the wordmark shows on the dark nav.
  if (variant === "menu" || variant === "sidebar") {
    return (
      <div
        role="img"
        aria-label={s.alt}
        className={cn("stitch-menu-logo shrink-0", s.className, className)}
      />
    )
  }

  return (
    <Image
      src={s.src}
      alt={s.alt}
      width={s.width}
      height={s.height}
      className={cn("shrink-0 object-contain", s.className, className)}
      priority={priority}
    />
  )
}
