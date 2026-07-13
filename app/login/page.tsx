"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@/components/user-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { OryxLogo } from "@/components/oryx-logo"
import { ArrowRight } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const { user, loading: sessionLoading } = useUser()
  const [email, setEmail]           = useState("")
  const [password, setPassword]     = useState("")
  const [error, setError]           = useState("")
  const [loading, setLoading]       = useState(false)

  if (!sessionLoading && user) {
    router.replace("/")
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json() as { error?: string; mustChangePassword?: boolean }

      if (!res.ok) {
        setError(data.error ?? "Login failed")
        return
      }

      window.location.href = data.mustChangePassword ? "/set-password" : "/"
    } catch {
      setError("Connection error — please try again")
    } finally {
      setLoading(false)
    }
  }

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-pg">
        <div className="skeleton h-10 w-10 rounded-full" aria-label="Loading" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-pg text-t1">
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-[440px] flex-col items-center">
          <div className="mb-10 text-center">
            <OryxLogo variant="login" className="mx-auto h-24 w-auto md:h-32" priority />
          </div>

          <section className="w-full rounded-lg border border-bd bg-sr p-8 shadow-sm">
            <header className="mb-6">
              <h1 className="text-2xl font-semibold tracking-tight text-t1">Operations Portal Access</h1>
              <p className="mt-1 text-sm text-t3">Secure engineering entry point</p>
            </header>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-medium uppercase tracking-wider text-t3">
                  Email Address
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="engineering@oryx.design"
                  className="h-12 border-bd bg-sr focus-visible:ring-ac/30"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-t3">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 border-bd bg-sr focus-visible:ring-ac/30"
                />
              </div>

              {error && (
                <div className="rounded border border-dn-bd bg-dn-bg p-3 text-sm font-medium text-dn-tx">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                className="mt-2 h-12 w-full"
                loading={loading}
                disabled={loading}
              >
                Sign In
                {!loading && <ArrowRight className="ml-1.5 h-4 w-4" />}
              </Button>
            </form>
          </section>

          <nav className="mt-6 flex items-center gap-4 text-xs text-t3">
            <span className="hover:text-t1 transition-colors cursor-default">Support Center</span>
            <span className="text-bd">•</span>
            <span className="hover:text-t1 transition-colors cursor-default">Request Access</span>
          </nav>
        </div>
      </main>

      <footer className="flex flex-col items-center justify-between gap-3 border-t border-bd bg-sr px-8 py-4 text-xs text-t3 md:flex-row">
        <div>
          <span className="mr-2 font-mono text-[11px] uppercase tracking-tighter text-t1">Oryx Design</span>
          <span>© 2026 Oryx Design. Engineering Minimalism.</span>
        </div>
        <div className="flex gap-6">
          <span className="cursor-default hover:text-t1 transition-colors">Privacy Policy</span>
          <span className="cursor-default hover:text-t1 transition-colors">Terms of Service</span>
          <span className="cursor-default hover:text-t1 transition-colors">Security</span>
        </div>
      </footer>
    </div>
  )
}
