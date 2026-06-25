import type { Config } from "tailwindcss"

/**
 * Tailwind CSS v4 configuration.
 *
 * NOTE: In Tailwind v4, custom colors/shadows/fonts are defined in globals.css
 * using the @theme directive — NOT here. This file is only read for content
 * paths and plugin configuration in v4.
 *
 * The @theme block in globals.css generates all utility classes:
 *   --color-sr → bg-sr, text-sr, border-sr, etc.
 *   --color-t1 → text-t1, bg-t1, etc.
 *   --shadow-modal → shadow-modal
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
}

export default config
