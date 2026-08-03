import type { Metadata } from "next"
import "./globals.css"
import { inter } from "@/app/fonts"
import { ToastProvider }  from "@/components/ui/toast"
import { UserProvider }   from "@/components/user-context"
import { ThemeProvider }  from "@/components/theme-provider"
import { SWRProvider }    from "@/components/swr-provider"
import { AppShell }       from "@/components/app-shell"
import { THEME_INIT_SCRIPT } from "@/shared/theme/theme-utils"
import { buildSessionPayload } from "@/shared/auth/session-payload"

export const metadata: Metadata = {
  title: { default: "ORYX Design", template: "%s · ORYX" },
  description: "Scaffold design job management",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Perf: seed session in RSC so shell/nav paint without waiting on client /api/auth/session.
  const fallbackSession = await buildSessionPayload().catch(() => null)

  return (
    <html lang="en" className={`stitch-layout ${inter.variable}`} suppressHydrationWarning>
      <head>
        {/* Static theme-init only — not user-supplied HTML (safe). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body style={{ height: "100%", margin: 0 }}>
        <ThemeProvider>
          <UserProvider fallbackSession={fallbackSession}>
            <SWRProvider>
              <ToastProvider>
                <AppShell>{children}</AppShell>
              </ToastProvider>
            </SWRProvider>
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
