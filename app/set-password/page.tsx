"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@/components/user-context"
import { Check, X } from "lucide-react"
import { AuthLayout, AuthBrand } from "@/components/page-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FormAlert } from "@/components/ui/field"

const RULES = [
  { test: (p: string) => p.length >= 8,      label: "At least 8 characters" },
  { test: (p: string) => /[A-Z]/.test(p),    label: "One uppercase letter" },
  { test: (p: string) => /[a-z]/.test(p),    label: "One lowercase letter" },
  { test: (p: string) => /[0-9]/.test(p),    label: "One number" },
]

export default function SetPasswordPage() {
  const router = useRouter()
  const { user, loading: sessionLoading, logout } = useUser()
  const [password, setPassword]       = useState("")
  const [confirm,  setConfirm]        = useState("")
  const [error,    setError]          = useState("")
  const [loading,  setLoading]        = useState(false)
  const [success,  setSuccess]        = useState(false)
  const [signingOut, setSigningOut]   = useState(false)

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login")
  }, [sessionLoading, user, router])

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-pg">
        <div className="skeleton h-10 w-10 rounded-full" aria-label="Loading" />
      </div>
    )
  }
  if (!user) return null

  const allRulesPass = RULES.every(r => r.test(password))
  const passwordsMatch = password === confirm && confirm.length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!allRulesPass) { setError("Password does not meet requirements"); return }
    if (!passwordsMatch) { setError("Passwords do not match"); return }

    setLoading(true)
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPassword: confirm }),
      })
      const data = await res.json() as { error?: string }

      if (!res.ok) { setError(data.error ?? "Failed to set password"); return }

      setSuccess(true)
      setTimeout(() => { window.location.href = "/" }, 1500)
    } catch {
      setError("Connection error — please try again")
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <AuthLayout>
        <div className="text-center py-4">
          <div className="w-12 h-12 rounded-full bg-ok-bg flex items-center justify-center mx-auto mb-4">
            <Check className="h-6 w-6 text-ok-ic" />
          </div>
          <p className="text-base font-semibold text-t1">Password set</p>
          <p className="text-sm text-t3 mt-1">Redirecting to dashboard…</p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthBrand
        title="Set your password"
        subtitle={`Hi ${user.name} — please choose a secure password for your account.`}
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="New password" htmlFor="new-password" required>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            autoFocus
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </Field>

        <Field label="Confirm password" htmlFor="confirm-password" required>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
          />
        </Field>

        <div className="p-3 bg-pg rounded-md space-y-1">
          {RULES.map((rule, i) => {
            const pass = password.length > 0 && rule.test(password)
            return (
              <div key={i} className={`flex items-center gap-2 text-xs ${pass ? "text-ok-tx" : "text-t4"}`}>
                {pass ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                {rule.label}
              </div>
            )
          })}
          {confirm.length > 0 && (
            <div className={`flex items-center gap-2 text-xs ${passwordsMatch ? "text-ok-tx" : "text-dn-tx"}`}>
              {passwordsMatch ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              Passwords match
            </div>
          )}
        </div>

        {error && <FormAlert>{error}</FormAlert>}

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={loading}
          disabled={loading || signingOut || !allRulesPass || !passwordsMatch}
        >
          Set password
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          loading={signingOut}
          disabled={loading || signingOut}
          onClick={async () => {
            setSigningOut(true)
            try {
              await logout()
              window.location.href = "/login"
            } catch {
              setSigningOut(false)
              setError("Could not sign out — please try again")
            }
          }}
        >
          Sign out instead
        </Button>
      </form>
    </AuthLayout>
  )
}
