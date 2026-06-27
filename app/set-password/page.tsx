"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { useUser } from "@/components/user-context"
import { Check, X } from "lucide-react"

const RULES = [
  { test: (p: string) => p.length >= 8,      label: "At least 8 characters" },
  { test: (p: string) => /[A-Z]/.test(p),    label: "One uppercase letter" },
  { test: (p: string) => /[a-z]/.test(p),    label: "One lowercase letter" },
  { test: (p: string) => /[0-9]/.test(p),    label: "One number" },
]

export default function SetPasswordPage() {
  const router = useRouter()
  const { user, loading: sessionLoading } = useUser()
  const [password, setPassword]       = useState("")
  const [confirm,  setConfirm]        = useState("")
  const [error,    setError]          = useState("")
  const [loading,  setLoading]        = useState(false)
  const [success,  setSuccess]        = useState(false)

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login")
  }, [sessionLoading, user, router])

  if (sessionLoading) return null
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
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--color-pg)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", backgroundColor: "var(--color-ok-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Check style={{ width: "24px", height: "24px", color: "var(--color-ok-ic)" }} />
          </div>
          <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-t1)" }}>Password set</p>
          <p style={{ fontSize: "13px", color: "var(--color-t3)", marginTop: "4px" }}>Redirecting to dashboard…</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--color-pg)", padding: "16px" }}>
      <div style={{ width: "100%", maxWidth: "400px", backgroundColor: "var(--color-sr)", border: "1px solid var(--color-bd)", borderRadius: "20px", padding: "40px 32px 32px", boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.03), 0 8px 24px -8px rgb(0 0 0 / 0.08)" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
          <Image src="/branding/LOGO2025.jpg" alt="Oryx Design" width={120} height={120} style={{ width: "80px", height: "auto", objectFit: "contain" }} priority />
        </div>

        <h1 style={{ fontSize: "18px", fontWeight: 600, color: "var(--color-t1)", textAlign: "center", marginBottom: "4px" }}>
          Set your password
        </h1>
        <p style={{ fontSize: "13px", color: "var(--color-t3)", textAlign: "center", marginBottom: "28px" }}>
          Hi {user.name} — please choose a secure password for your account.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "16px" }}>
            <label htmlFor="new-password" style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--color-t2)", marginBottom: "6px" }}>
              New password
            </label>
            <input
              id="new-password" type="password" autoComplete="new-password" autoFocus required
              value={password} onChange={e => setPassword(e.target.value)}
              style={{ width: "100%", height: "40px", padding: "0 12px", fontSize: "14px", color: "var(--color-t1)", backgroundColor: "var(--color-sr)", border: "1px solid var(--color-bd)", borderRadius: "8px", outline: "none", boxSizing: "border-box" }}
              onFocus={e => { e.target.style.borderColor = "var(--color-ac)" }}
              onBlur={e => { e.target.style.borderColor = "var(--color-bd)" }}
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label htmlFor="confirm-password" style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--color-t2)", marginBottom: "6px" }}>
              Confirm password
            </label>
            <input
              id="confirm-password" type="password" autoComplete="new-password" required
              value={confirm} onChange={e => setConfirm(e.target.value)}
              style={{ width: "100%", height: "40px", padding: "0 12px", fontSize: "14px", color: "var(--color-t1)", backgroundColor: "var(--color-sr)", border: "1px solid var(--color-bd)", borderRadius: "8px", outline: "none", boxSizing: "border-box" }}
              onFocus={e => { e.target.style.borderColor = "var(--color-ac)" }}
              onBlur={e => { e.target.style.borderColor = "var(--color-bd)" }}
            />
          </div>

          {/* Strength checklist */}
          <div style={{ marginBottom: "20px", padding: "12px", backgroundColor: "var(--color-pg)", borderRadius: "8px" }}>
            {RULES.map((rule, i) => {
              const pass = password.length > 0 && rule.test(password)
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "3px 0", fontSize: "12px", color: pass ? "var(--color-ok-tx)" : "var(--color-t4)" }}>
                  {pass ? <Check style={{ width: "14px", height: "14px" }} /> : <X style={{ width: "14px", height: "14px" }} />}
                  {rule.label}
                </div>
              )
            })}
            {confirm.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "3px 0", fontSize: "12px", color: passwordsMatch ? "var(--color-ok-tx)" : "var(--color-dn-tx)" }}>
                {passwordsMatch ? <Check style={{ width: "14px", height: "14px" }} /> : <X style={{ width: "14px", height: "14px" }} />}
                Passwords match
              </div>
            )}
          </div>

          {error && (
            <div style={{ marginBottom: "16px", padding: "10px 12px", backgroundColor: "var(--color-dn-bg)", border: "1px solid var(--color-dn-bd)", borderRadius: "8px", fontSize: "13px", color: "var(--color-dn-tx)", fontWeight: 500 }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading || !allRulesPass || !passwordsMatch}
            style={{ width: "100%", height: "40px", backgroundColor: "var(--color-ac)", color: "#ffffff", fontSize: "14px", fontWeight: 600, border: "none", borderRadius: "8px", cursor: loading || !allRulesPass || !passwordsMatch ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", opacity: loading || !allRulesPass || !passwordsMatch ? 0.5 : 1 }}
          >
            {loading ? "Setting password…" : "Set password"}
          </button>
        </form>
      </div>
    </div>
  )
}
