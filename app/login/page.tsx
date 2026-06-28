"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@/components/user-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react"
import { OryxLogo } from "@/components/oryx-logo"

export default function LoginPage() {
  const router = useRouter()
  const { user, loading: sessionLoading } = useUser()
  const [email, setEmail]           = useState("")
  const [password, setPassword]     = useState("")
  const [showPassword, setShowPassword] = useState(false)
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

  if (sessionLoading) return null

  return (
    <div className="min-h-screen bg-pg flex items-center justify-center p-6">
      <main className="w-full max-w-[440px]">

        {/* Card */}
        <section
          className="w-full bg-sr rounded-2xl p-10 border border-bd"
          style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.02), 0 12px 48px -8px rgba(0,0,0,0.06)" }}
        >

          {/* Brand block */}
          <div className="mb-8 text-center">
            <div className="flex items-center justify-center mb-3">
              <div className="rounded-xl bg-[#1C1C1E] px-4 py-3">
                <OryxLogo variant="login" priority />
              </div>
            </div>
            <h1 className="text-2xl font-semibold text-t1 tracking-tight">ORYX Scaffold Design</h1>
            <p className="text-sm text-t3 mt-1">Dashboard</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-[11px] font-bold text-t3 uppercase tracking-widest"
              >
                Email Address
              </label>
              <div className="relative group">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-t4 group-focus-within:text-ac transition-colors pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@oryxdesign.com"
                  className="pl-10"
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-[11px] font-bold text-t3 uppercase tracking-widest"
              >
                Password
              </label>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-t4 group-focus-within:text-ac transition-colors pointer-events-none" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-t4 hover:text-t2 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword
                    ? <EyeOff className="h-4 w-4" />
                    : <Eye className="h-4 w-4" />
                  }
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-dn-bg border border-dn-bd rounded-lg text-sm text-dn-tx font-medium">
                {error}
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2"
              loading={loading}
              disabled={loading}
            >
              Sign In
              {!loading && <ArrowRight className="h-4 w-4 ml-1.5" />}
            </Button>

          </form>
        </section>

        {/* Footer */}
        <footer className="mt-5 text-center">
          <p className="text-[11px] font-bold text-t4 uppercase tracking-widest">
            ORYX Scaffold Design Ltd
          </p>
        </footer>

      </main>
    </div>
  )
}
