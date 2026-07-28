import { Inter, JetBrains_Mono } from "next/font/google"

export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
})

/** @deprecated Prefer `inter` — kept as alias for any residual imports. */
export const figtree = inter

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-mono",
  display: "swap",
})
