import crypto from "crypto"

const ALGO = "aes-256-gcm"
const PREFIX = "v1:"

function vaultKey(): Buffer {
  const raw = process.env.VAULT_ENCRYPTION_KEY
    ?? (process.env.NODE_ENV === "production"
      ? null
      : process.env.SESSION_SECRET ?? "oryx-dev-vault-key-change-in-production")
  if (!raw) {
    throw new Error("VAULT_ENCRYPTION_KEY is required in production")
  }
  return crypto.createHash("sha256").update(raw).digest()
}

/** Encrypt a vault secret for storage at rest. */
export function encryptVaultSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, vaultKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`
}

/** Decrypt a vault secret from storage. Plaintext legacy values pass through. */
export function decryptVaultSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored
  const parts = stored.split(":")
  if (parts.length !== 4) throw new Error("Invalid vault ciphertext format")
  const iv = Buffer.from(parts[1], "base64")
  const tag = Buffer.from(parts[2], "base64")
  const data = Buffer.from(parts[3], "base64")
  const decipher = crypto.createDecipheriv(ALGO, vaultKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
}
