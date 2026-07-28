"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@/components/user-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FormAlert } from "@/components/ui/field"
import { AuthLayout, AuthBrand } from "@/components/page-layout"
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
    <AuthLayout>
      <AuthBrand
        title="Operations Portal Access"
        subtitle="Secure engineering entry point"
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Email address" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="engineering@oryx.design"
          />
        </Field>

        <Field label="Password" htmlFor="password" required>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>

        {error && <FormAlert>{error}</FormAlert>}

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={loading}
          disabled={loading}
        >
          Sign In
          {!loading && <ArrowRight className="ml-1.5 h-4 w-4" />}
        </Button>
      </form>
    </AuthLayout>
  )
}
