import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { encryptVaultSecret, decryptVaultSecret } = require("../../modules/password-vault/crypto/vault-crypto.ts")

describe("vault crypto", () => {
  it("round-trips a secret through encrypt and decrypt", () => {
    const plain = "SuperSecret!123"
    const enc = encryptVaultSecret(plain)
    assert.ok(enc.startsWith("v1:"))
    assert.notEqual(enc, plain)
    assert.equal(decryptVaultSecret(enc), plain)
  })

  it("produces different ciphertext for the same plaintext", () => {
    const a = encryptVaultSecret("same-value")
    const b = encryptVaultSecret("same-value")
    assert.notEqual(a, b)
    assert.equal(decryptVaultSecret(a), decryptVaultSecret(b))
  })

  it("passes through legacy plaintext values", () => {
    assert.equal(decryptVaultSecret("legacy-plain"), "legacy-plain")
  })
})
