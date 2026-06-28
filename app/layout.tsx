import type { Metadata } from "next"
import "./globals.css"
import { inter, jetbrainsMono } from "@/app/fonts"
import { ToastProvider }  from "@/components/ui/toast"
import { UserProvider }   from "@/components/user-context"
import { ThemeProvider }  from "@/components/theme-provider"
import { SWRProvider }    from "@/components/swr-provider"
import { AppShell }       from "@/components/app-shell"

export const metadata: Metadata = {
  title: { default: "Oryx Design", template: "%s · Oryx" },
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){try{var t=localStorage.getItem("oryx-theme");
          if(t==="dark"||(t==null&&matchMedia("(prefers-color-scheme:dark)").matches))
          document.documentElement.classList.add("dark")}catch(e){}})()
        `}} />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable}`} style={{ height: "100%", margin: 0 }}>
        <ThemeProvider>
          <UserProvider>
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
