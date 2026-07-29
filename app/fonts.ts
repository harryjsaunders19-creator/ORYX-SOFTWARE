import { Inter } from "next/font/google"

export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
})

/** @deprecated Prefer `inter` — kept as alias for any residual imports. */
export const figtree = inter

/**
 * @deprecated Second family removed — typography is Inter-only.
 * Alias kept so residual imports of `jetbrainsMono` still resolve.
 */
export const jetbrainsMono = inter
