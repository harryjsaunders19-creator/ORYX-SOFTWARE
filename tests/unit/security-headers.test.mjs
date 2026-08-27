import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { buildContentSecurityPolicy } from "../../shared/security/headers.ts"

describe("security headers CSP", () => {
  it("builds a narrow CSP without unsafe-eval", () => {
    const csp = buildContentSecurityPolicy()
    assert.match(csp, /default-src 'self'/)
    assert.match(csp, /frame-ancestors 'none'/)
    assert.match(csp, /object-src 'none'/)
    assert.match(csp, /script-src 'self' 'unsafe-inline'/)
    assert.doesNotMatch(csp, /unsafe-eval/)
    assert.match(csp, /connect-src 'self'/)
  })

  it("allows Supabase HTTPS + WSS when origin is provided", () => {
    const csp = buildContentSecurityPolicy({
      supabaseOrigin: "https://abc.supabase.co",
    })
    assert.match(csp, /connect-src 'self' https:\/\/abc\.supabase\.co wss:\/\/abc\.supabase\.co/)
  })
})
