"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Eye, EyeOff } from "lucide-react"
import { useUser } from "@/components/user-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormAlert } from "@/components/ui/field"
import { AuthLayout, AuthBrand } from "@/components/page-layout"
import { cn } from "@/shared/utils"
import { Typography } from "@/shared/design/typography"

function formatLoginError(error: unknown): string {
  if (typeof error === "string") return error
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) return message
  }
  return ""
}

export default function LoginPage() {
  const router = useRouter()
  const { user, loading: sessionLoading } = useUser()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [loading, setLoading] = useState(false)

  if (!sessionLoading && user) {
    router.replace("/")
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setInfo("")
    setLoading(true)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      let data: { error?: unknown; mustChangePassword?: boolean; protection?: unknown } = {}
      try {
        data = await res.json() as typeof data
      } catch {
        setError(
          res.status >= 500
            ? "Internal server error — the app could not complete sign-in. Confirm you are on https://oryx-software.vercel.app (not a protected preview link)."
            : "Login failed",
        )
        return
      }

      if (!res.ok) {
        if (data.protection || (typeof data.error === "object" && data.error && "message" in data.error
          && String((data.error as { message?: string }).message).toLowerCase().includes("protected"))) {
          setError(
            "This preview deployment is protected. Open production at https://oryx-software.vercel.app, or sign in to Vercel SSO first, then retry.",
          )
          return
        }
        setError(formatLoginError(data.error) || "Login failed")
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
    <AuthLayout>
      <AuthBrand title="Sign in to your account" />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="email"
            className={cn(Typography.Helper, "font-semibold uppercase tracking-widest text-t3")}
          >
            Work Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="rounded bg-pg focus:border-t1 focus:ring-0"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-end justify-between gap-3">
            <label
              htmlFor="password"
              className={cn(Typography.Helper, "font-semibold uppercase tracking-widest text-t3")}
            >
              Password
            </label>
            <button
              type="button"
              className={cn(Typography.Helper, "text-t3 transition-colors hover:text-t1")}
              onClick={() => {
                setError("")
                setInfo("Contact your administrator to reset your password.")
              }}
            >
              Forgot Password?
            </button>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="rounded bg-pg pr-10 focus:border-t1 focus:ring-0"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-t3 transition-colors hover:text-t1"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden />
              ) : (
                <Eye className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
        </div>

        {error ? <FormAlert>{error}</FormAlert> : null}
        {info && !error ? (
          <p className={cn(Typography.Small, "rounded border border-bd bg-pg p-3 text-t3")}>{info}</p>
        ) : null}

        <div className="pt-1">
          <Button
            type="submit"
            variant="primary"
            className="h-11 w-full rounded uppercase tracking-widest"
            loading={loading}
            disabled={loading}
          >
            {loading ? "Authorizing…" : "Sign In"}
            {!loading && <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />}
          </Button>
        </div>
      </form>

      <div className="mt-8 border-t border-bd pt-8 text-center">
        <p className={cn(Typography.Small, "mb-4 text-t3")}>New to ORYX OS?</p>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full rounded uppercase tracking-widest"
          onClick={() => {
            setError("")
            setInfo("Request system access from your ORYX administrator.")
          }}
        >
          Request System Access
        </Button>
      </div>
    </AuthLayout>
  )
}
