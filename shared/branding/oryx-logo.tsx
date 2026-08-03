import Image from "next/image"
import { cn } from "@/shared/utils"
import {
  BRAND_LOGO_AUTH,
  BRAND_LOGO_DOCUMENT,
  BRAND_LOGO_MENU,
} from "@/shared/branding/branding"

type OryxLogoProps = {
  /** `menu` — sidebar nav (greyscale logo). `login` / `auth*` — transparent wordmark. */
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
    alt: "ORYX Scaffold Design",
  },
  sidebar: {
    src: BRAND_LOGO_MENU,
    width: 1024,
    height: 631,
    className: "w-full max-w-[180px] h-auto",
    alt: "ORYX Scaffold Design",
  },
  auth: {
    src: BRAND_LOGO_AUTH,
    width: 613,
    height: 380,
    className: "h-auto w-[260px] sm:w-[320px] md:w-[360px]",
    alt: "ORYX Scaffold Design",
  },
  "auth-panel": {
    src: BRAND_LOGO_AUTH,
    width: 613,
    height: 380,
    className: "h-auto w-full max-w-[320px]",
    alt: "ORYX Scaffold Design",
  },
  login: {
    src: BRAND_LOGO_AUTH,
    width: 613,
    height: 380,
    className: "h-auto w-[280px] sm:w-[340px] md:w-[400px]",
    alt: "ORYX Scaffold Design",
  },
  document: {
    src: BRAND_LOGO_DOCUMENT,
    width: 280,
    height: 100,
    className: "h-auto w-auto",
    alt: "ORYX Scaffold Design",
  },
} as const

export function OryxLogo({ variant = "menu", className, priority }: OryxLogoProps) {
  const s = VARIANTS[variant === "sidebar" ? "menu" : variant]

  // Sidebar mark: luminance mask on a theme-aware fill (dark on light sidebar,
  // light on dark sidebar).
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
      className={cn("shrink-0 object-contain bg-transparent", s.className, className)}
      priority={priority}
    />
  )
}
