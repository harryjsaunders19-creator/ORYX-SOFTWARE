#!/usr/bin/env node
/**
 * Vault encryption key rotation helper.
 *
 * Re-encrypts all password-vault secrets with a new key.
 * Run from the project root with both keys available:
 *
 *   OLD_VAULT_KEY=<old> NEW_VAULT_KEY=<new> node scripts/vault-key-rotate.mjs
 *
 * Steps:
 *   1. Decrypt every secret with OLD_VAULT_KEY
 *   2. Re-encrypt with NEW_VAULT_KEY
 *   3. Update rows in Supabase
 *   4. After verification, set VAULT_ENCRYPTION_KEY=<new> in production
 */
import crypto from "crypto"
import { createClient } from "@supabase/supabase-js"

const ALGO = "aes-256-gcm"
const PREFIX = "v1:"

function deriveKey(raw) {
  return crypto.createHash("sha256").update(raw).digest()
}

function decrypt(stored, key) {
  if (!stored.startsWith(PREFIX)) return stored
  const parts = stored.split(":")
  if (parts.length !== 4) throw new Error("Invalid vault ciphertext format")
  const iv   = Buffer.from(parts[1], "base64")
  const tag  = Buffer.from(parts[2], "base64")
  const data = Buffer.from(parts[3], "base64")
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
}

function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`
}

const OLD_KEY = process.env.OLD_VAULT_KEY?.trim()
const NEW_KEY = process.env.NEW_VAULT_KEY?.trim()
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const SERVICE_ROLE = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY)?.trim()

if (!OLD_KEY || !NEW_KEY) {
  console.error("Usage: OLD_VAULT_KEY=<old> NEW_VAULT_KEY=<new> node scripts/vault-key-rotate.mjs")
  process.exit(1)
}
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")
  process.exit(1)
}

const oldKey = deriveKey(OLD_KEY)
const newKey = deriveKey(NEW_KEY)

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: rows, error } = await sb
  .from("password_vault")
  .select("id, encrypted_password, encrypted_notes")

if (error) { console.error("Failed to fetch vault rows:", error.message); process.exit(1) }
if (!rows?.length) { console.log("No vault entries to rotate."); process.exit(0) }

console.log(`Rotating ${rows.length} vault entries…`)
let updated = 0

for (const row of rows) {
  const patch = {}
  if (row.encrypted_password) {
    const plain = decrypt(row.encrypted_password, oldKey)
    patch.encrypted_password = encrypt(plain, newKey)
  }
  if (row.encrypted_notes) {
    const plain = decrypt(row.encrypted_notes, oldKey)
    patch.encrypted_notes = encrypt(plain, newKey)
  }
  if (Object.keys(patch).length === 0) continue

  const { error: ue } = await sb.from("password_vault").update(patch).eq("id", row.id)
  if (ue) { console.error(`Failed to update row ${row.id}:`, ue.message); process.exit(1) }
  updated++
}

console.log(`Done — ${updated} entries re-encrypted.`)
console.log(`\nNext steps:`)
console.log(`  1. Verify the vault works with NEW_VAULT_KEY locally`)
console.log(`  2. Set VAULT_ENCRYPTION_KEY=${NEW_KEY} in Vercel env vars`)
console.log(`  3. Redeploy`)
