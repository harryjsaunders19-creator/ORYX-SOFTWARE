"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@/components/user-context"
import { AuthLayout, AuthBrand } from "@/components/page-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  const router = useRouter()
  const { user, loading: sessionLoading } = useUser()
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [error, setError]       = useState("")
  const [loading, setLoading]   = useState(false)

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
    <AuthLayout>
      <AuthBrand title="Welcome back" subtitle="Sign in to Oryx Design" />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div className="p-3 bg-dn-bg border border-dn-bd rounded-md text-sm text-dn-tx font-medium">
            {error}
          </div>
        )}

        <Button type="submit" variant="primary" className="w-full" loading={loading} disabled={loading}>
          Sign in
        </Button>
      </form>

      <p className="text-[11px] text-t4 text-center mt-8">Oryx Design Ltd</p>
    </AuthLayout>
  )
}
