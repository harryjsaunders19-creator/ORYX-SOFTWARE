"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { useUser } from "@/components/user-context"

export default function LoginPage() {
  const router = useRouter()
  const { user, loading: sessionLoading } = useUser()
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [error, setError]       = useState("")
  const [loading, setLoading]   = useState(false)

  // Already logged in — redirect to dashboard
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
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--color-pg)",
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          backgroundColor: "var(--color-sr)",
          border: "1px solid var(--color-bd)",
          borderRadius: "20px",
          padding: "40px 32px 32px",
          boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.03), 0 8px 24px -8px rgb(0 0 0 / 0.08)",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
          <Image
            src="/branding/LOGO2025.jpg"
            alt="Oryx Design"
            width={120}
            height={120}
            style={{ width: "80px", height: "auto", objectFit: "contain" }}
            priority
          />
        </div>

        <h1
          style={{
            fontSize: "18px",
            fontWeight: 600,
            color: "var(--color-t1)",
            textAlign: "center",
            marginBottom: "4px",
          }}
        >
          Welcome back
        </h1>
        <p
          style={{
            fontSize: "13px",
            color: "var(--color-t3)",
            textAlign: "center",
            marginBottom: "28px",
          }}
        >
          Sign in to Oryx Design
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="email"
              style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--color-t2)", marginBottom: "6px" }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: "100%",
                height: "40px",
                padding: "0 12px",
                fontSize: "14px",
                color: "var(--color-t1)",
                backgroundColor: "var(--color-sr)",
                border: "1px solid var(--color-bd)",
                borderRadius: "8px",
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={e => { e.target.style.borderColor = "var(--color-ac)" }}
              onBlur={e => { e.target.style.borderColor = "var(--color-bd)" }}
            />
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label
              htmlFor="password"
              style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--color-t2)", marginBottom: "6px" }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: "100%",
                height: "40px",
                padding: "0 12px",
                fontSize: "14px",
                color: "var(--color-t1)",
                backgroundColor: "var(--color-sr)",
                border: "1px solid var(--color-bd)",
                borderRadius: "8px",
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={e => { e.target.style.borderColor = "var(--color-ac)" }}
              onBlur={e => { e.target.style.borderColor = "var(--color-bd)" }}
            />
          </div>

          {error && (
            <div
              style={{
                marginBottom: "16px",
                padding: "10px 12px",
                backgroundColor: "var(--color-dn-bg)",
                border: "1px solid var(--color-dn-bd)",
                borderRadius: "8px",
                fontSize: "13px",
                color: "var(--color-dn-tx)",
                fontWeight: 500,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              height: "40px",
              backgroundColor: "var(--color-ac)",
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: 600,
              border: "none",
              borderRadius: "8px",
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }} />
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" style={{ opacity: 0.75 }} />
              </svg>
            )}
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  )
}
